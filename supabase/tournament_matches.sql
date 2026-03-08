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
