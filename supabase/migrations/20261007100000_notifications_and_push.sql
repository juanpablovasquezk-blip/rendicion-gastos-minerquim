-- =============================================================================
-- Migración 7 · Sistema de Notificaciones In-App y Web Push
-- =============================================================================

-- 1. Tabla de Notificaciones In-App
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  message    text not null,
  type       text not null default 'general',
  link       text,
  is_read    boolean not null default false,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Índices de búsqueda y orden
create index if not exists idx_notifications_user_unread on public.notifications (user_id, is_read, created_at desc);
create index if not exists idx_notifications_user_created on public.notifications (user_id, created_at desc);

-- RLS para Notificaciones
alter table public.notifications enable row level security;

create policy "Los usuarios pueden ver sus propias notificaciones"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Los usuarios pueden actualizar (leer) sus propias notificaciones"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Los usuarios pueden eliminar sus propias notificaciones"
  on public.notifications for delete
  using (auth.uid() = user_id);

create policy "Cualquier usuario autenticado o proceso puede insertar notificaciones"
  on public.notifications for insert
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');


-- 2. Tabla de Suscripciones Web Push (PWA)
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subs_user on public.push_subscriptions (user_id);

-- RLS para Push Subscriptions
alter table public.push_subscriptions enable row level security;

create policy "Los usuarios pueden ver sus propias suscripciones push"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Los usuarios pueden registrar suscripciones push"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Los usuarios pueden actualizar sus propias suscripciones push"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Los usuarios pueden eliminar sus suscripciones push"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);


-- 3. Habilitar Supabase Realtime para la tabla de notificaciones
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception
  when others then null;
end $$;
