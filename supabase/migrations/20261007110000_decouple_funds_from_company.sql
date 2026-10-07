-- =============================================================================
-- Migración 8 · Desacoplar Solicitud de Fondos de la Empresa
-- Los fondos son asignados directamente al colaborador sin amarrarlos a una empresa.
-- Los gastos individuales (expenses) sí mantienen su asignación obligatoria por empresa.
-- =============================================================================

-- 1. Permitir company_id nulo en cash_advances
alter table public.cash_advances alter column company_id drop not null;

-- 2. Actualizar política RLS de inserción de fondos
drop policy if exists funds_insert on public.cash_advances;

create policy funds_insert on public.cash_advances for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.auth_role() is not null
  );
