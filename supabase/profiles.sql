create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists is_admin boolean not null default false;
alter table public.profiles
  add column if not exists username text,
  add column if not exists avatar_url text,
  add column if not exists steam_id text;
