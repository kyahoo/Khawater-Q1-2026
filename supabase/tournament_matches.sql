create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_a_id uuid not null references public.teams (id),
  team_b_id uuid not null references public.teams (id),
  round_label text not null,
  scheduled_at timestamptz null,
  status text not null default 'scheduled',
  team_a_score integer null,
  team_b_score integer null,
  display_order integer not null default 0,
  format text not null default 'BO3',
  created_at timestamptz not null default now()
);

alter table public.tournament_matches
add column if not exists format text not null default 'BO3';

alter table public.tournament_matches
add column if not exists lobby_name text null;

alter table public.tournament_matches
add column if not exists lobby_password text null;

alter table public.tournament_matches
add column if not exists result_screenshot_url text null;

alter table public.tournament_matches
add column if not exists result_screenshot_urls text[] not null default '{}'::text[];

alter table public.tournament_matches
add column if not exists winner_team_id uuid null references public.teams (id);

alter table public.tournament_matches
add column if not exists require_lobby_photo boolean not null default true;

alter table public.tournament_matches
add column if not exists lobby_photo_map1_only boolean not null default false;
