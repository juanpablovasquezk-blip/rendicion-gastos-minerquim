-- =============================================================================
-- Migración 10 · Permisos robustos de empresas y almacenamiento para gastos
-- =============================================================================

-- 1. Actualizar user_can_use_company para incluir manager y asegurar fallback amplio
create or replace function public.user_can_use_company(p_user uuid, p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    -- Administrador, Gerencia General y Jefes/Managers pueden usar cualquier empresa activa
    when (select role from public.profiles where id = p_user) in ('admin', 'general_manager', 'manager') then true
    -- Si el colaborador tiene asignada la empresa explícitamente en user_companies
    when exists (select 1 from public.user_companies where user_id = p_user and company_id = p_company) then true
    -- Si el colaborador no tiene empresas asignadas específicamente, tiene acceso a todas las activas
    when not exists (select 1 from public.user_companies where user_id = p_user) then true
    else false
  end
$$;

-- 2. Asegurar que bucket receipts exista y tenga permisos correctos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  26214400, -- 25MB
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf','application/xml','text/xml']
)
on conflict (id) do update set
  file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','application/pdf','application/xml','text/xml'];

-- 3. Políticas de storage para receipts
drop policy if exists receipts_read on storage.objects;
drop policy if exists receipts_insert on storage.objects;
drop policy if exists receipts_update on storage.objects;
drop policy if exists receipts_delete on storage.objects;

create policy receipts_read on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_manage_user(((storage.foldername(name))[1])::uuid)
      or public.auth_role() in ('admin', 'general_manager', 'manager')
    )
  );

create policy receipts_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.auth_role() in ('admin', 'general_manager')
    )
  );

create policy receipts_update on storage.objects for update to authenticated
  using (
    bucket_id = 'receipts' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.auth_role() in ('admin', 'general_manager')
    )
  );

create policy receipts_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.auth_role() in ('admin', 'general_manager')
    )
  );
