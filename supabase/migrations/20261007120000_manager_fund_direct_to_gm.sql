-- =============================================================================
-- Migración 9 · Solicitud de Fondos de Gerentes/Admins directa a Gerencia General
-- Cuando un Admin o Manager solicita fondos, pasa directamente a etapa 'general_manager'
-- para depósito y activación sin auto-aprobación en etapa Operaciones.
-- =============================================================================

create or replace function public.guard_fund_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.user_role;
begin
  -- Obtener rol del perfil solicitante
  select role, department_id into r, new.department_id
  from public.profiles
  where id = new.user_id;

  -- Si el solicitante es Gerencia/Admin (aprobador de operaciones), pasa DIRECTO a Gerencia General
  if r in ('admin', 'manager') then
    new.status := 'approved';
    new.approval_stage := 'general_manager';
    new.approved_amount := new.requested_amount;
  else
    new.status := 'requested';
    new.approval_stage := 'admin';
    new.approved_amount := null;
  end if;

  new.initial_amount := null;
  new.current_balance := 0;
  new.deposit_receipt_path := null;
  new.deposited_by := null;
  new.deposited_at := null;
  new.needs_gm := true;
  return new;
end $$;
