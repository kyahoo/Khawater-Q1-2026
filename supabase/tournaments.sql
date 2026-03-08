create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_confirmations (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

create index if not exists tournament_confirmations_user_id_idx
  on public.tournament_confirmations (user_id);

update public.tournaments
set is_active = false
where name = 'Khawater Season 3 - Spring 2025';

insert into public.tournaments (name, is_active)
select 'Khawater Season 3 - Spring 2025', true
where not exists (
  select 1
  from public.tournaments
  where name = 'Khawater Season 3 - Spring 2025'
);

update public.tournaments
set is_active = (name = 'Khawater Season 3 - Spring 2025');
