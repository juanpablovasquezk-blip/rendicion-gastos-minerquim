-- =============================================================================
-- Migración 14 · Consolidación de Reembolsos Pendientes en Nuevos Fondos
-- =============================================================================

alter table public.cash_advances add column if not exists reimbursements_bonus bigint not null default 0;
alter table public.cash_advances add column if not exists linked_reimbursement_ids uuid[] not null default '{}';
