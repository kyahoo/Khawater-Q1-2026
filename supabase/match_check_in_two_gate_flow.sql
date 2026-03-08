alter table public.match_check_ins
add column if not exists is_checked_in boolean;

update public.match_check_ins
set is_checked_in = true
where is_checked_in is null;

alter table public.match_check_ins
alter column is_checked_in set default false;

alter table public.match_check_ins
alter column is_checked_in set not null;

alter table public.match_check_ins
add column if not exists lobby_screenshot_url text;

create index if not exists match_check_ins_match_id_is_checked_in_idx
  on public.match_check_ins (match_id, is_checked_in);

insert into storage.buckets (id, name, public)
values ('match-screenshots', 'match-screenshots', true)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload match screenshots'
  ) then
    create policy "Authenticated users can upload match screenshots"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'match-screenshots'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can update match screenshots'
  ) then
    create policy "Authenticated users can update match screenshots"
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'match-screenshots'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
      bucket_id = 'match-screenshots'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can read match screenshots'
  ) then
    create policy "Authenticated users can read match screenshots"
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'match-screenshots'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end
$$;
