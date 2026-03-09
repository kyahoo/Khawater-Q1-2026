create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  link_url text null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_id_created_at_idx
  on public.user_notifications (user_id, created_at desc);

create index if not exists user_notifications_user_id_is_read_idx
  on public.user_notifications (user_id, is_read);
