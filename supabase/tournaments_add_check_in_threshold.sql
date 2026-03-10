alter table public.tournaments
add column if not exists check_in_threshold integer not null default 10;

notify pgrst, 'reload schema';
