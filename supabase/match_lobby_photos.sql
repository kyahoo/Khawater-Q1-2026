alter table public.match_check_ins
add column if not exists is_ready boolean;

update public.match_check_ins
set is_ready = coalesce(is_ready, is_checked_in, false)
where is_ready is null;

alter table public.match_check_ins
alter column is_ready set default false;

alter table public.match_check_ins
alter column is_ready set not null;

create table if not exists public.match_lobby_photos (
  match_id uuid not null references public.tournament_matches (id) on delete cascade,
  player_id uuid not null references auth.users (id) on delete cascade,
  map_number integer not null,
  photo_url text not null,
  created_at timestamptz not null default now(),
  primary key (match_id, player_id, map_number),
  constraint match_lobby_photos_map_number_check
    check (map_number between 1 and 3)
);

create index if not exists match_lobby_photos_match_id_map_number_idx
  on public.match_lobby_photos (match_id, map_number);
