alter table public.match_check_ins
add column if not exists is_ready boolean;

update public.match_check_ins
set is_ready = false
where is_ready is null;

alter table public.match_check_ins
alter column is_ready set default false;

alter table public.match_check_ins
alter column is_ready set not null;

create index if not exists match_check_ins_match_id_is_ready_idx
  on public.match_check_ins (match_id, is_ready);

NOTIFY pgrst, 'reload schema';
