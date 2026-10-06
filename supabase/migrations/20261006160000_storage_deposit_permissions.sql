-- =============================================================================
-- Migración 5 · Permisos de Storage para comprobantes de depósito
-- Permite que tanto 'admin' como 'general_manager' puedan subir y ver comprobantes de depósito.
-- =============================================================================

-- Asegurar que el bucket deposits exista
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deposits',
  'deposits',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760;

-- Eliminar políticas antiguas de deposits si existen
drop policy if exists deposits_read on storage.objects;
drop policy if exists deposits_insert on storage.objects;
drop policy if exists deposits_update on storage.objects;
drop policy if exists deposits_delete on storage.objects;

-- Política de lectura: Admin y Gerencia General leen todo, o el colaborador dueño del fondo
create policy deposits_read on storage.objects for select to authenticated
  using (
    bucket_id = 'deposits' and (
      public.auth_role() in ('admin', 'general_manager')
      or exists (
        select 1 from public.cash_advances f
        where f.id::text = (storage.foldername(name))[1]
          and f.user_id = auth.uid()
      )
    )
  );

-- Política de inserción: Admin y Gerencia General pueden subir comprobantes
create policy deposits_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'deposits' and public.auth_role() in ('admin', 'general_manager')
  );

-- Política de actualización
create policy deposits_update on storage.objects for update to authenticated
  using (
    bucket_id = 'deposits' and public.auth_role() in ('admin', 'general_manager')
  );
