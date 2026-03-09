create table if not exists public.behavior_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  match_id uuid null references public.tournament_matches (id) on delete set null,
  score_change integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);
