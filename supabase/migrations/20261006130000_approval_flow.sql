-- =============================================================================
-- Migración 2 · Flujo de aprobación definitivo
--   Solicitud de fondo / rendición:  colaborador → Gerencia de Operaciones (admin)
--                                    → Gerencia General (siempre) → depósito / cierre
--   La etapa 'manager' queda sin uso (se conserva en el enum por si se reactiva).
-- Ejecutar DESPUÉS de 20261006120000_init.sql
-- =============================================================================

alter table public.cash_advances   alter column approval_stage set default 'admin';
alter table public.expense_reports alter column approval_stage set default 'admin';
alter table public.cash_advances   alter column needs_gm       set default true;
alter table public.expense_reports alter column needs_gm       set default true;

-- Si más adelante quieren que Gerencia General intervenga solo sobre un umbral,
-- se cambia únicamente esta función.
create or replace function public.report_needs_gm(p_report uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select true
$$;

create or replace function public.fund_needs_gm(p_amount bigint, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select true
$$;

-- Fondos: la solicitud entra directo a la etapa 'admin'
create or replace function public.guard_fund_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select p.department_id into new.department_id from public.profiles p where p.id = new.user_id;
  if auth.uid() is not null then
    new.status := 'requested'; new.approval_stage := 'admin';
    new.approved_amount := null; new.initial_amount := null; new.current_balance := 0;
    new.deposit_receipt_path := null; new.deposited_by := null; new.deposited_at := null;
  end if;
  new.needs_gm := public.fund_needs_gm(new.requested_amount, new.user_id);
  return new;
end $$;

-- Informes: nacen en etapa 'admin'
create or replace function public.guard_report_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.status := 'draft'; new.approval_stage := 'admin'; new.needs_gm := true;
    new.total_amount := 0; new.approved_amount := 0; new.submitted_at := null;
  end if;
  if new.fund_id is not null and not exists (
      select 1 from public.cash_advances f
      where f.id = new.fund_id and f.user_id = new.user_id and f.status = 'active') then
    raise exception 'El fondo no existe, no es tuyo o no está activo';
  end if;
  return new;
end $$;

-- Informes: al enviar (o reenviar) vuelven a la etapa 'admin'
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
        new.approval_stage := 'admin';
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

grant execute on all functions in schema public to authenticated, service_role;
