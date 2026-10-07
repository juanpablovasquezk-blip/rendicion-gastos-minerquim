-- =============================================================================
-- Migración 13 · Cierre de Fondos, Neteo y Crédito de Saldo Remanente
-- =============================================================================

-- 1. Agregar balance de crédito a favor de la empresa en profiles
alter table public.profiles add column if not exists credit_balance bigint not null default 0 check (credit_balance >= 0);

-- 2. Agregar campos para créditos aplicados en cash_advances
alter table public.cash_advances add column if not exists applied_credit bigint not null default 0 check (applied_credit >= 0);
alter table public.cash_advances add column if not exists net_deposit_amount bigint;

-- 3. Actualizar guard_fund_update para permitir que el titular, admin o GM cierren fondos activos
create or replace function public.guard_fund_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.user_role := public.auth_role();
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then return new; end if;

  -- 1. Colaborador común (no aprobador): puede cancelar mientras esté solicitado, confirmar recepción o cerrar si está activo
  if r = 'employee' or r is null then
    if (new.approved_amount, new.initial_amount, new.current_balance, new.approval_stage, new.needs_gm,
        new.deposit_receipt_path, new.deposited_by, new.deposited_at, new.user_id, new.company_id)
       is distinct from
       (old.approved_amount, old.initial_amount, old.current_balance, old.approval_stage, old.needs_gm,
        old.deposit_receipt_path, old.deposited_by, old.deposited_at, old.user_id, old.company_id) then
      raise exception 'No puedes modificar campos de aprobación o depósito';
    end if;
    if new.status is distinct from old.status
       and not (old.status = 'requested' and new.status = 'cancelled')
       and not (old.status in ('requested', 'approved') and new.status = 'active' and auth.uid() = old.user_id)
       and not (old.status = 'active' and new.status in ('closed', 'settled') and auth.uid() = old.user_id) then
      raise exception 'Transición de estado no permitida';
    end if;
    if old.status <> 'requested' and (new.requested_amount, new.purpose) is distinct from (old.requested_amount, old.purpose) then
      raise exception 'La solicitud ya no se puede editar';
    end if;
    return new;
  end if;

  -- 2. Activación (depósito bancario o entrega en efectivo): Gerencia General o Admin
  if (old.status in ('requested', 'approved')) and new.status = 'active' then
    if r not in ('general_manager', 'admin') and auth.uid() <> old.user_id then
      raise exception 'Solo Gerencia General o Administrador registran la entrega/depósito del fondo';
    end if;
    new.initial_amount := coalesce(new.approved_amount, old.approved_amount, old.requested_amount);
    new.deposited_by := coalesce(new.deposited_by, auth.uid());
    new.deposited_at := coalesce(new.deposited_at, now());
    new.date_assigned := coalesce(new.date_assigned, current_date);
    return new;
  end if;

  -- 3. Cadena de aprobación de solicitud
  if old.status = 'requested' and (new.status is distinct from old.status or new.approval_stage is distinct from old.approval_stage) then
    if new.status = 'rejected' and length(trim(coalesce(new.rejection_reason, ''))) = 0 then
      raise exception 'El rechazo requiere un motivo';
    end if;
    if new.status = 'approved' and new.approved_amount is null then
      new.approved_amount := old.requested_amount;
    end if;
    return new;
  end if;

  -- 4. Cierre y liquidación (Permitido para el titular, admin o GM)
  if old.status = 'active' and new.status in ('closed', 'settled') then
    if r not in ('admin', 'general_manager', 'manager') and auth.uid() <> old.user_id then
      raise exception 'No tienes permisos para cerrar este fondo';
    end if;
    return new;
  end if;

  return new;
end $$;
