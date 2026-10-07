-- =============================================================================
-- Migración 14 · Permitir inserción/actualización directa de reportes y gastos aprobados
-- (Ej. Liquidación por cierre de fondo con saldo deficitario)
-- =============================================================================

-- 1. Actualizar guard_report_insert para no forzar draft si se especificó status approved
create or replace function public.guard_report_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    if new.status is null then
      new.status := 'draft';
    end if;
    if new.approval_stage is null then
      new.approval_stage := 'admin';
    end if;
    if new.status = 'draft' then
      new.total_amount := 0;
      new.approved_amount := 0;
      new.submitted_at := null;
    end if;
  end if;
  if new.fund_id is not null and not exists (
      select 1 from public.cash_advances f
      where f.id = new.fund_id and f.user_id = new.user_id and f.status = 'active') then
    raise exception 'El fondo no existe, no es tuyo o no está activo';
  end if;
  return new;
end $$;

-- 2. Auto-recuperar reportes de excedente de fondo que hayan quedado en draft
update public.expenses
set status = 'approved'
where report_id in (
  select id from public.expense_reports
  where report_type = 'reimbursement' and title like 'Reembolso por Excedente de Fondo%'
);

update public.expense_reports r
set status = 'approved',
    approval_stage = 'done',
    total_amount = coalesce(nullif((select sum(total_amount) from public.expenses where report_id = r.id), 0), r.total_amount),
    approved_amount = coalesce(nullif((select sum(total_amount) from public.expenses where report_id = r.id and status = 'approved'), 0), r.approved_amount)
where report_type = 'reimbursement' and title like 'Reembolso por Excedente de Fondo%';
