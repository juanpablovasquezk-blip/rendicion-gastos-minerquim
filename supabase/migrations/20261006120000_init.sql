-- =============================================================================
-- Rendición de Gastos · Grupo Minerquim — Migración inicial (H2)
-- Ejecutar completo en Supabase → SQL Editor (o `supabase db push`).
-- Modelo: 4 roles, multiempresa, solicitud/depósito de fondos, aprobación en
-- cadena (manager → admin → gerencia general si supera umbral), RLS estricta.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. TIPOS
-- -----------------------------------------------------------------------------
create type public.user_role      as enum ('employee', 'manager', 'admin', 'general_manager');
create type public.approval_stage as enum ('manager', 'admin', 'general_manager', 'done');
create type public.fund_status    as enum ('requested', 'approved', 'rejected', 'active', 'closed', 'settled', 'cancelled');
create type public.report_type    as enum ('reimbursement', 'fund_rendition');
create type public.report_status  as enum ('draft', 'submitted', 'partially_approved', 'approved', 'rejected', 'settled');
create type public.expense_status as enum ('pending', 'approved', 'rejected');

-- -----------------------------------------------------------------------------
-- 2. UTILIDADES
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Valida RUT chileno (formato 12345678-K, con dígito verificador)
create or replace function public.rut_is_valid(rut text) returns boolean
language plpgsql immutable as $$
declare
  body text; dv text; total int := 0; mul int := 2; i int; calc int; expected text;
begin
  if rut is null or rut !~ '^[0-9]{7,8}-[0-9kK]$' then return false; end if;
  body := split_part(rut, '-', 1);
  dv := upper(split_part(rut, '-', 2));
  for i in reverse length(body)..1 loop
    total := total + substr(body, i, 1)::int * mul;
    mul := case when mul = 7 then 2 else mul + 1 end;
  end loop;
  calc := 11 - (total % 11);
  expected := case calc when 11 then '0' when 10 then 'K' else calc::text end;
  return expected = dv;
end $$;

-- -----------------------------------------------------------------------------
-- 3. TABLAS DE CONFIGURACIÓN (las administra el rol admin)
-- -----------------------------------------------------------------------------
create table public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  rut        text check (rut is null or public.rut_is_valid(rut)),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.departments (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  code               text not null unique,          -- código de centro de costo
  monthly_budget     bigint not null default 0 check (monthly_budget >= 0),
  approval_threshold bigint check (approval_threshold is null or approval_threshold >= 0), -- null = sin escalamiento
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.receipt_types (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  sii_code        int,                              -- código DTE (33, 34, 39, 61...)
  requires_receipt boolean not null default true,   -- false = "sin comprobante"
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4. PERFILES Y EMPRESAS POR USUARIO
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  email         text not null unique,
  phone         text,                                -- para WhatsApp
  role          public.user_role not null default 'employee',
  department_id uuid references public.departments(id),
  supervisor_id uuid references public.profiles(id),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Empresas a cuyo nombre puede comprar cada colaborador
create table public.user_companies (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary key (user_id, company_id)
);

-- Crea el perfil automáticamente al invitar/crear un usuario en Auth.
-- El rol SIEMPRE parte como 'employee'; solo un admin puede cambiarlo.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), new.email));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 5. FUNCIONES DE SEGURIDAD (usadas por RLS)
-- -----------------------------------------------------------------------------
create or replace function public.auth_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_approver() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.auth_role() in ('manager', 'admin', 'general_manager'), false)
$$;

-- ¿Puede el usuario actual ver/gestionar a `target`?
-- admin y gerente general: todos · manager: sus supervisados y su área
create or replace function public.can_manage_user(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when public.auth_role() in ('admin', 'general_manager') then true
    when public.auth_role() = 'manager' then exists (
      select 1
      from public.profiles t, public.profiles m
      where t.id = target and m.id = auth.uid()
        and (t.supervisor_id = m.id
             or (m.department_id is not null and t.department_id = m.department_id))
    )
    else false
  end
$$;

-- ¿El rol actual puede actuar en la etapa de aprobación indicada?
create or replace function public.stage_actor_ok(stage public.approval_stage) returns boolean
language sql stable security definer set search_path = '' as $$
  select case stage
    when 'manager'         then public.auth_role() in ('manager', 'admin')
    when 'admin'           then public.auth_role() = 'admin'
    when 'general_manager' then public.auth_role() = 'general_manager'
    else false
  end
$$;

create or replace function public.user_can_use_company(p_user uuid, p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_companies where user_id = p_user and company_id = p_company)
$$;

-- -----------------------------------------------------------------------------
-- 6. FONDOS POR RENDIR (solicitud → aprobación → depósito → rendición)
-- -----------------------------------------------------------------------------
create table public.cash_advances (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id),
  company_id           uuid not null references public.companies(id),
  department_id        uuid references public.departments(id),
  purpose              text not null check (length(trim(purpose)) >= 5), -- para qué lo necesita
  requested_amount     bigint not null check (requested_amount > 0),
  approved_amount      bigint check (approved_amount is null or approved_amount > 0),
  initial_amount       bigint check (initial_amount is null or initial_amount > 0), -- monto depositado
  current_balance      bigint not null default 0,    -- se recalcula por trigger
  status               public.fund_status not null default 'requested',
  approval_stage       public.approval_stage not null default 'manager',
  needs_gm             boolean not null default false,
  deposit_receipt_path text,                         -- comprobante del depósito (bucket 'deposits')
  deposit_note         text,
  deposited_by         uuid references public.profiles(id),
  deposited_at         timestamptz,
  date_assigned        date,
  rejection_reason     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index on public.cash_advances (user_id, status);

-- -----------------------------------------------------------------------------
-- 7. INFORMES Y GASTOS
-- -----------------------------------------------------------------------------
create table public.expense_reports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id),
  title           text not null,
  report_type     public.report_type not null default 'reimbursement',
  fund_id         uuid references public.cash_advances(id),
  status          public.report_status not null default 'draft',
  approval_stage  public.approval_stage not null default 'manager',
  needs_gm        boolean not null default false,
  total_amount    bigint not null default 0,         -- gastos no rechazados
  approved_amount bigint not null default 0,         -- gastos aprobados
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((report_type = 'fund_rendition') = (fund_id is not null))
);
create index on public.expense_reports (user_id, status);
create index on public.expense_reports (fund_id);

create table public.expenses (
  id                uuid primary key default gen_random_uuid(),
  report_id         uuid not null references public.expense_reports(id) on delete cascade,
  user_id           uuid not null references public.profiles(id),
  company_id        uuid not null references public.companies(id),
  department_id     uuid not null references public.departments(id),   -- área / centro de costo
  category_id       uuid not null references public.categories(id),
  receipt_type_id   uuid not null references public.receipt_types(id),
  date              date not null,
  supplier_name     text,
  supplier_rut      text check (supplier_rut is null or public.rut_is_valid(supplier_rut)),
  invoice_number    text,
  has_receipt       boolean not null default true,
  receipt_path      text,                            -- bucket 'receipts': {user_id}/...
  xml_path          text,                            -- XML DTE original
  receipt_hash      text,                            -- SHA-256 de la imagen
  total_amount      bigint not null check (total_amount > 0),
  tax_amount        bigint not null default 0 check (tax_amount >= 0),
  description       text,
  justification     text,                            -- obligatoria sin comprobante
  is_duplicate_flag boolean not null default false,
  status            public.expense_status not null default 'pending',
  rejection_reason  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (has_receipt or length(trim(coalesce(justification, ''))) >= 5),
  check (tax_amount <= total_amount)
);
create index on public.expenses (report_id);
create index on public.expenses (user_id, date);
create index on public.expenses (department_id, date);
create index on public.expenses (supplier_rut, invoice_number, total_amount);
create index on public.expenses (receipt_hash) where receipt_hash is not null;

create table public.approval_history (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid references public.expense_reports(id) on delete cascade,
  expense_id      uuid references public.expenses(id) on delete cascade,
  fund_id         uuid references public.cash_advances(id) on delete cascade,
  subject_user_id uuid not null references public.profiles(id), -- dueño del informe/fondo
  approver_id     uuid not null references public.profiles(id),
  action          text not null check (action in
                    ('submitted','approved','rejected','escalated','deposited','observed','settled','cancelled')),
  comments        text,
  created_at      timestamptz not null default now(),
  check (report_id is not null or fund_id is not null)
);
create index on public.approval_history (report_id);
create index on public.approval_history (fund_id);

-- updated_at
create trigger trg_upd_companies   before update on public.companies       for each row execute function public.set_updated_at();
create trigger trg_upd_departments before update on public.departments     for each row execute function public.set_updated_at();
create trigger trg_upd_profiles    before update on public.profiles        for each row execute function public.set_updated_at();
create trigger trg_upd_funds       before update on public.cash_advances   for each row execute function public.set_updated_at();
create trigger trg_upd_reports     before update on public.expense_reports for each row execute function public.set_updated_at();
create trigger trg_upd_expenses    before update on public.expenses        for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 8. TRIGGERS DE SALDOS Y TOTALES
-- (los triggers 'a_' son guardas y corren antes que los 'b_')
-- -----------------------------------------------------------------------------
create or replace function public.fund_rendido(p_fund uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(e.total_amount), 0)::bigint
  from public.expenses e
  join public.expense_reports r on r.id = e.report_id
  where r.fund_id = p_fund and r.status <> 'draft' and e.status <> 'rejected'
$$;

-- Saldo del fondo = monto depositado − total rendido (no rechazado, informes enviados)
create or replace function public.fund_recalc_balance() returns trigger
language plpgsql as $$
begin
  new.current_balance := coalesce(new.initial_amount, 0) - public.fund_rendido(new.id);
  return new;
end $$;
create trigger b_fund_balance before update on public.cash_advances
  for each row execute function public.fund_recalc_balance();

create or replace function public.recalc_after_expense() returns trigger
language plpgsql security definer set search_path = '' as $$
declare rid uuid; fid uuid;
begin
  for rid in select distinct x from unnest(array[
      case when tg_op in ('UPDATE','DELETE') then old.report_id end,
      case when tg_op in ('UPDATE','INSERT') then new.report_id end]) x where x is not null
  loop
    update public.expense_reports r set
      total_amount    = coalesce((select sum(total_amount) from public.expenses where report_id = rid and status <> 'rejected'), 0),
      approved_amount = coalesce((select sum(total_amount) from public.expenses where report_id = rid and status = 'approved'), 0)
    where r.id = rid
    returning fund_id into fid;
    if fid is not null then
      update public.cash_advances set updated_at = now() where id = fid; -- dispara recálculo de saldo
    end if;
  end loop;
  return null;
end $$;
create trigger b_expense_recalc after insert or update or delete on public.expenses
  for each row execute function public.recalc_after_expense();

create or replace function public.recalc_after_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.fund_id is not null then
    update public.cash_advances set updated_at = now() where id = new.fund_id;
  end if;
  if tg_op = 'UPDATE' and old.fund_id is not null and old.fund_id is distinct from new.fund_id then
    update public.cash_advances set updated_at = now() where id = old.fund_id;
  end if;
  return null;
end $$;
create trigger b_report_recalc after insert or update of status, fund_id on public.expense_reports
  for each row execute function public.recalc_after_report();

-- Detección de duplicados: (RUT + folio + monto) o mismo hash de imagen
create or replace function public.expense_flag_duplicate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.is_duplicate_flag := exists (
    select 1 from public.expenses e
    where e.id <> new.id and e.status <> 'rejected' and (
      (new.supplier_rut is not null and new.invoice_number is not null
        and e.supplier_rut = new.supplier_rut and e.invoice_number = new.invoice_number
        and e.total_amount = new.total_amount)
      or (new.receipt_hash is not null and e.receipt_hash = new.receipt_hash)));
  return new;
end $$;
create trigger b_expense_dupe before insert or update on public.expenses
  for each row execute function public.expense_flag_duplicate();

-- -----------------------------------------------------------------------------
-- 9. GUARDAS DE NEGOCIO (impiden saltarse el flujo desde el cliente)
-- auth.uid() null = SQL Editor / service_role → sin restricción.
-- -----------------------------------------------------------------------------

-- 9.1 Perfiles: solo admin cambia rol, área, supervisor, estado y email
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if public.auth_role() is distinct from 'admin' then
    if (new.role, new.department_id, new.supervisor_id, new.is_active, new.email)
       is distinct from (old.role, old.department_id, old.supervisor_id, old.is_active, old.email) then
      raise exception 'Solo un administrador puede modificar rol, área, supervisor o estado';
    end if;
  end if;
  return new;
end $$;
create trigger a_profile_guard before update on public.profiles
  for each row execute function public.guard_profile();

-- 9.2 Fondos
create or replace function public.guard_fund_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare thr bigint;
begin
  select p.department_id, d.approval_threshold into new.department_id, thr
  from public.profiles p left join public.departments d on d.id = p.department_id
  where p.id = new.user_id;
  if auth.uid() is not null then
    new.status := 'requested'; new.approval_stage := 'manager';
    new.approved_amount := null; new.initial_amount := null; new.current_balance := 0;
    new.deposit_receipt_path := null; new.deposited_by := null; new.deposited_at := null;
  end if;
  new.needs_gm := thr is not null and new.requested_amount > thr;
  return new;
end $$;
create trigger a_fund_insert before insert on public.cash_advances
  for each row execute function public.guard_fund_insert();

create or replace function public.guard_fund_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.user_role := public.auth_role();
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then return new; end if;

  -- Solicitante (o colaborador): solo puede cancelar mientras está solicitado
  if auth.uid() = old.user_id or r = 'employee' then
    if (new.approved_amount, new.initial_amount, new.current_balance, new.approval_stage, new.needs_gm,
        new.deposit_receipt_path, new.deposited_by, new.deposited_at, new.user_id, new.company_id)
       is distinct from
       (old.approved_amount, old.initial_amount, old.current_balance, old.approval_stage, old.needs_gm,
        old.deposit_receipt_path, old.deposited_by, old.deposited_at, old.user_id, old.company_id) then
      raise exception 'No puedes modificar campos de aprobación o depósito';
    end if;
    if new.status is distinct from old.status
       and not (old.status = 'requested' and new.status = 'cancelled') then
      raise exception 'Transición de estado no permitida';
    end if;
    if old.status <> 'requested' and (new.requested_amount, new.purpose) is distinct from (old.requested_amount, old.purpose) then
      raise exception 'La solicitud ya no se puede editar';
    end if;
    return new;
  end if;

  -- Activación (depósito): solo gerente general, con comprobante
  if old.status = 'approved' and new.status = 'active' then
    if r <> 'general_manager' then raise exception 'Solo Gerencia General registra el depósito'; end if;
    if new.deposit_receipt_path is null then raise exception 'Debes adjuntar el comprobante del depósito'; end if;
    new.initial_amount := coalesce(old.approved_amount, old.requested_amount);
    new.deposited_by := auth.uid();
    new.deposited_at := now();
    new.date_assigned := current_date;
    return new;
  end if;

  -- Cierre / liquidación
  if old.status = 'active' and new.status in ('closed', 'settled') then
    if r not in ('admin', 'general_manager') then raise exception 'Solo admin o Gerencia General cierran fondos'; end if;
    return new;
  end if;
  if old.status = 'closed' and new.status = 'settled' then
    if r not in ('admin', 'general_manager') then raise exception 'Solo admin o Gerencia General liquidan fondos'; end if;
    return new;
  end if;

  -- Cadena de aprobación: debe actuar el rol de la etapa vigente
  if old.status = 'requested' and (new.status is distinct from old.status
       or new.approval_stage is distinct from old.approval_stage) then
    if not public.stage_actor_ok(old.approval_stage) then
      raise exception 'No te corresponde aprobar esta etapa';
    end if;
    if new.status = 'rejected' and length(trim(coalesce(new.rejection_reason, ''))) = 0 then
      raise exception 'El rechazo requiere un motivo';
    end if;
    if new.status = 'approved' and new.approved_amount is null then
      new.approved_amount := old.requested_amount;
    end if;
    return new;
  end if;

  if (new.status, new.initial_amount) is distinct from (old.status, old.initial_amount) then
    raise exception 'Transición de estado no permitida';
  end if;
  return new;
end $$;
create trigger a_fund_update before update on public.cash_advances
  for each row execute function public.guard_fund_update();

-- 9.3 Informes
create or replace function public.report_needs_gm(p_report uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.expenses e
    join public.departments d on d.id = e.department_id
    where e.report_id = p_report and e.status <> 'rejected' and d.approval_threshold is not null
    group by d.id, d.approval_threshold
    having sum(e.total_amount) > d.approval_threshold)
$$;

create or replace function public.guard_report_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.status := 'draft'; new.approval_stage := 'manager'; new.needs_gm := false;
    new.total_amount := 0; new.approved_amount := 0; new.submitted_at := null;
  end if;
  if new.fund_id is not null and not exists (
      select 1 from public.cash_advances f
      where f.id = new.fund_id and f.user_id = new.user_id and f.status = 'active') then
    raise exception 'El fondo no existe, no es tuyo o no está activo';
  end if;
  return new;
end $$;
create trigger a_report_insert before insert on public.expense_reports
  for each row execute function public.guard_report_insert();

create or replace function public.guard_report_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.user_role := public.auth_role();
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then return new; end if;

  if auth.uid() = old.user_id or r = 'employee' then
    if (new.approval_stage, new.needs_gm, new.total_amount, new.approved_amount, new.user_id, new.fund_id, new.report_type)
       is distinct from
       (old.approval_stage, old.needs_gm, old.total_amount, old.approved_amount, old.user_id, old.fund_id, old.report_type) then
      raise exception 'No puedes modificar campos de aprobación';
    end if;
    if new.status is distinct from old.status then
      if (old.status in ('draft', 'partially_approved') and new.status = 'submitted') then
        if not exists (select 1 from public.expenses where report_id = old.id and status <> 'rejected') then
          raise exception 'El informe no tiene gastos para enviar';
        end if;
        new.approval_stage := 'manager';
        new.needs_gm := public.report_needs_gm(old.id);
        new.submitted_at := now();
      elsif old.status = 'rejected' and new.status = 'draft' then
        null;
      else
        raise exception 'Transición de estado no permitida';
      end if;
    end if;
    return new;
  end if;

  if old.status = 'approved' and new.status = 'settled' then
    if r not in ('admin', 'general_manager') then raise exception 'Solo admin o Gerencia General liquidan'; end if;
    return new;
  end if;

  if new.status is distinct from old.status or new.approval_stage is distinct from old.approval_stage then
    if not public.stage_actor_ok(old.approval_stage) then
      raise exception 'No te corresponde aprobar esta etapa';
    end if;
  end if;
  return new;
end $$;
create trigger a_report_update before update on public.expense_reports
  for each row execute function public.guard_report_update();

-- 9.4 Gastos
create or replace function public.guard_expense() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.user_role := public.auth_role(); rep public.expense_reports;
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then return new; end if;

  if tg_op = 'INSERT' then
    new.status := 'pending'; new.rejection_reason := null;
    if (select requires_receipt from public.receipt_types where id = new.receipt_type_id) is distinct from new.has_receipt then
      raise exception 'El tipo de comprobante no coincide con "tiene comprobante"';
    end if;
    return new;
  end if;

  select * into rep from public.expense_reports where id = old.report_id;

  if auth.uid() = old.user_id or r = 'employee' then
    if old.status = 'approved' then raise exception 'Un gasto aprobado no se puede editar'; end if;
    if new.status is distinct from old.status and not (old.status = 'rejected' and new.status = 'pending') then
      raise exception 'No puedes cambiar el estado del gasto';
    end if;
    if new.report_id is distinct from old.report_id or new.user_id is distinct from old.user_id then
      raise exception 'No puedes mover el gasto';
    end if;
    if old.status = 'rejected' then  -- corrección y reenvío
      new.status := 'pending'; new.rejection_reason := null;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if rep.status <> 'submitted' or not public.stage_actor_ok(rep.approval_stage) then
      raise exception 'No puedes resolver este gasto en la etapa actual';
    end if;
    if new.status = 'rejected' and length(trim(coalesce(new.rejection_reason, ''))) = 0 then
      raise exception 'El rechazo requiere un motivo';
    end if;
  end if;
  return new;
end $$;
create trigger a_expense_guard before insert or update on public.expenses
  for each row execute function public.guard_expense();

-- Historial: fija el dueño del informe/fondo y el aprobador
create or replace function public.history_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then new.approver_id := auth.uid(); end if;
  select user_id into new.subject_user_id from (
    select user_id from public.expense_reports where id = new.report_id
    union all select user_id from public.cash_advances where id = new.fund_id) s limit 1;
  return new;
end $$;
create trigger a_history_defaults before insert on public.approval_history
  for each row execute function public.history_defaults();

-- -----------------------------------------------------------------------------
-- 10. VISTA DE RESUMEN DE FONDOS (saldo en tiempo real)
-- -----------------------------------------------------------------------------
create or replace view public.fund_summary with (security_invoker = true) as
select
  f.id, f.user_id, f.company_id, f.status, f.initial_amount,
  coalesce(sum(e.total_amount) filter (where r.status <> 'draft' and e.status <> 'rejected'), 0) as total_rendido,
  coalesce(sum(e.total_amount) filter (where e.status = 'approved'), 0)                         as total_aprobado,
  f.current_balance as saldo  -- >0 disponible · <0 a favor del colaborador (reembolso)
from public.cash_advances f
left join public.expense_reports r on r.fund_id = f.id
left join public.expenses e on e.report_id = r.id
group by f.id;

-- -----------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
alter table public.companies        enable row level security;
alter table public.departments      enable row level security;
alter table public.categories       enable row level security;
alter table public.receipt_types    enable row level security;
alter table public.profiles         enable row level security;
alter table public.user_companies   enable row level security;
alter table public.cash_advances    enable row level security;
alter table public.expense_reports  enable row level security;
alter table public.expenses         enable row level security;
alter table public.approval_history enable row level security;

-- Configuración: lectura para autenticados, escritura solo admin
do $$
declare t text;
begin
  foreach t in array array['companies', 'departments', 'categories', 'receipt_types'] loop
    execute format('create policy "%1$s_read" on public.%1$s for select to authenticated using (public.auth_role() is not null)', t);
    execute format('create policy "%1$s_admin_write" on public.%1$s for all to authenticated
                    using (public.auth_role() = ''admin'') with check (public.auth_role() = ''admin'')', t);
  end loop;
end $$;

-- Perfiles
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.can_manage_user(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.auth_role() = 'admin')
  with check (id = auth.uid() or public.auth_role() = 'admin');

-- Empresas por usuario
create policy user_companies_read on public.user_companies for select to authenticated
  using (user_id = auth.uid() or public.can_manage_user(user_id));
create policy user_companies_admin on public.user_companies for all to authenticated
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');

-- Fondos
create policy funds_read on public.cash_advances for select to authenticated
  using (user_id = auth.uid() or public.can_manage_user(user_id));
create policy funds_insert on public.cash_advances for insert to authenticated
  with check (user_id = auth.uid() and public.auth_role() is not null
              and public.user_can_use_company(auth.uid(), company_id));
create policy funds_update on public.cash_advances for update to authenticated
  using (user_id = auth.uid() or (public.is_approver() and public.can_manage_user(user_id)))
  with check (user_id = auth.uid() or (public.is_approver() and public.can_manage_user(user_id)));

-- Informes
create policy reports_read on public.expense_reports for select to authenticated
  using (user_id = auth.uid() or public.can_manage_user(user_id));
create policy reports_insert on public.expense_reports for insert to authenticated
  with check (user_id = auth.uid() and public.auth_role() is not null);
create policy reports_update on public.expense_reports for update to authenticated
  using (user_id = auth.uid() or (public.is_approver() and public.can_manage_user(user_id)))
  with check (user_id = auth.uid() or (public.is_approver() and public.can_manage_user(user_id)));
create policy reports_delete on public.expense_reports for delete to authenticated
  using (user_id = auth.uid() and status = 'draft');

-- Gastos
create policy expenses_read on public.expenses for select to authenticated
  using (user_id = auth.uid() or public.can_manage_user(user_id));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.user_can_use_company(auth.uid(), company_id)
    and exists (select 1 from public.expense_reports r
                where r.id = report_id and r.user_id = auth.uid()
                  and r.status in ('draft', 'partially_approved')));
create policy expenses_update on public.expenses for update to authenticated
  using (user_id = auth.uid() or (public.is_approver() and public.can_manage_user(user_id)))
  with check (user_id = auth.uid() or (public.is_approver() and public.can_manage_user(user_id)));
create policy expenses_delete on public.expenses for delete to authenticated
  using (user_id = auth.uid() and status <> 'approved'
         and exists (select 1 from public.expense_reports r
                     where r.id = report_id and r.status in ('draft', 'partially_approved')));

-- Historial: inmutable (solo lectura e inserción)
create policy history_read on public.approval_history for select to authenticated
  using (subject_user_id = auth.uid() or public.can_manage_user(subject_user_id));
create policy history_insert on public.approval_history for insert to authenticated
  with check (
    (public.is_approver() and public.can_manage_user(subject_user_id) and subject_user_id <> auth.uid())
    or (subject_user_id = auth.uid() and action in ('submitted', 'cancelled')));

-- -----------------------------------------------------------------------------
-- 12. PERMISOS (la API de datos NO expone tablas automáticamente)
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated, service_role;
grant select on public.companies, public.departments, public.categories, public.receipt_types to authenticated;
grant insert, update, delete on public.companies, public.departments, public.categories, public.receipt_types to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_companies to authenticated;
grant select, insert, update on public.cash_advances to authenticated;
grant select, insert, update, delete on public.expense_reports, public.expenses to authenticated;
grant select, insert on public.approval_history to authenticated;
grant select on public.fund_summary to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 13. STORAGE (buckets privados)
-- receipts: {user_id}/{archivo}   ·   deposits: {fund_id}/{archivo}
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('receipts', 'receipts', false, 10485760,
    array['image/jpeg','image/png','image/webp','image/heic','application/pdf','application/xml','text/xml']),
  ('deposits', 'deposits', false, 10485760,
    array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.can_manage_user(((storage.foldername(name))[1])::uuid)));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy deposits_read on storage.objects for select to authenticated
  using (bucket_id = 'deposits' and exists (
    select 1 from public.cash_advances f
    where f.id::text = (storage.foldername(name))[1]
      and (f.user_id = auth.uid() or public.can_manage_user(f.user_id))));
create policy deposits_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'deposits' and public.auth_role() = 'general_manager');

-- -----------------------------------------------------------------------------
-- 14. DATOS INICIALES
-- -----------------------------------------------------------------------------
insert into public.categories (name) values
  ('Repuestos'), ('Artículos de aseo'), ('Uniformes'), ('EPP'), ('Combustible'),
  ('Alimentación'), ('Peajes y estacionamiento'), ('Locomoción'), ('Propinas'), ('Otros');

insert into public.receipt_types (code, name, sii_code, requires_receipt) values
  ('boleta_electronica',  'Boleta electrónica',          39,   true),
  ('factura_electronica', 'Factura electrónica',         33,   true),
  ('factura_exenta',      'Factura exenta electrónica',  34,   true),
  ('boleta_honorarios',   'Boleta de honorarios',        null, true),
  ('nota_credito',        'Nota de crédito electrónica', 61,   true),
  ('boleta_manual',       'Boleta manual / papel',       null, true),
  ('sin_comprobante',     'Sin comprobante',             null, false);

-- Las empresas, áreas y usuarios los crea el admin desde la app.
-- PRIMER ADMIN: tras crear tu usuario en Authentication → Users, ejecuta:
--   update public.profiles set role = 'admin' where email = 'tu@correo.cl';
