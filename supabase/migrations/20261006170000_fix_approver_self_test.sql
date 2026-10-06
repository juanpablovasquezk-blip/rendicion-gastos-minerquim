-- =============================================================================
-- Migración 6 · Permitir a Admin y Gerencia General aprobar gastos propios durante pruebas
-- =============================================================================

-- 1. Guard de Gastos
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

  -- Si es colaborador común (employee) o no tiene rol de aprobador
  if (r = 'employee' or r is null) and auth.uid() = old.user_id then
    if old.status = 'approved' then raise exception 'Un gasto aprobado no se puede editar'; end if;
    if new.status is distinct from old.status and not (old.status = 'rejected' and new.status = 'pending') then
      raise exception 'No puedes cambiar el estado del gasto';
    end if;
    if new.report_id is distinct from old.report_id or new.user_id is distinct from old.user_id then
      raise exception 'No puedes mover el gasto';
    end if;
    if old.status = 'rejected' then
      new.status := 'pending'; new.rejection_reason := null;
    end if;
    return new;
  end if;

  -- Si es aprobador (admin, general_manager, manager)
  if new.status is distinct from old.status then
    if new.status = 'rejected' and length(trim(coalesce(new.rejection_reason, ''))) = 0 then
      raise exception 'El rechazo requiere un motivo';
    end if;
  end if;
  return new;
end $$;

-- 2. Guard de Informes
create or replace function public.guard_report_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.user_role := public.auth_role();
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then return new; end if;

  -- Solo restringe si es colaborador común
  if (r = 'employee' or r is null) and auth.uid() = old.user_id then
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
