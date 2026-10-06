-- =============================================================================
-- Migración 3 · Permisos flexibles de empresas para Administradores y Colaboradores
-- =============================================================================

create or replace function public.user_can_use_company(p_user uuid, p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    -- Administrador y Gerencia General siempre pueden usar cualquier empresa activa
    when (select role from public.profiles where id = p_user) in ('admin', 'general_manager') then true
    -- Si el colaborador tiene asignada la empresa explícitamente
    when exists (select 1 from public.user_companies where user_id = p_user and company_id = p_company) then true
    -- Si el colaborador no tiene restricciones asignadas aún, puede usar cualquiera activa
    when not exists (select 1 from public.user_companies where user_id = p_user) then true
    else false
  end
$$;
