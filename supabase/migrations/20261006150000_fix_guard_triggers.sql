-- =============================================================================
-- Migración 4 · Ajuste de triggers para permitir aprobación administrativa
-- =============================================================================

create or replace function public.guard_fund_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.user_role := public.auth_role();
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then return new; end if;

  -- 1. Colaborador común (no aprobador): solo puede cancelar mientras está solicitado
  if r = 'employee' or r is null then
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

  -- 2. Activación (depósito bancario): Gerencia General o Admin, con comprobante
  if (old.status in ('requested', 'approved')) and new.status = 'active' then
    if r not in ('general_manager', 'admin') then raise exception 'Solo Gerencia General o Admin registran el depósito'; end if;
    if new.deposit_receipt_path is null then raise exception 'Debes adjuntar el comprobante del depósito'; end if;
    new.initial_amount := coalesce(new.approved_amount, old.approved_amount, old.requested_amount);
    new.deposited_by := auth.uid();
    new.deposited_at := now();
    new.date_assigned := current_date;
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

-- Permitir también que los aprobadores aprueben gastos e informes en pruebas
create or replace function public.guard_report_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.user_role := public.auth_role();
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then return new; end if;

  if r = 'employee' or r is null then
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

  return new;
end $$;
