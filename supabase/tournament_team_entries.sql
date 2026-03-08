create table if not exists public.tournament_team_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  entered_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tournament_id, team_id)
);
