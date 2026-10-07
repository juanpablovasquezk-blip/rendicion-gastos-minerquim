-- =============================================================================
-- Migración 11 · Permitir entrega de fondos en efectivo sin comprobante obligatorio
-- =============================================================================

create or replace function public.guard_fund_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.user_role := public.auth_role();
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then return new; end if;

  -- 1. Colaborador común (no aprobador): puede cancelar mientras esté solicitado o confirmar recepción
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
       and not (old.status in ('requested', 'approved') and new.status = 'active' and auth.uid() = old.user_id) then
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

  -- 4. Cierre y liquidación
  if old.status = 'active' and new.status in ('closed', 'settled') then
    if r not in ('admin', 'general_manager') then raise exception 'Solo admin o Gerencia General cierran fondos'; end if;
    return new;
  end if;

  return new;
end $$;
