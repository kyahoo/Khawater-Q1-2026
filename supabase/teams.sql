create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tagline text,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_captain boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id),
  unique (user_id)
);

create index if not exists team_members_user_id_idx
  on public.team_members (user_id);
