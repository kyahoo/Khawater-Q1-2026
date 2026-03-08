alter table public.match_check_ins
add column if not exists biometric_verified boolean default false;

update public.match_check_ins
set biometric_verified = false
where biometric_verified is null;

alter table public.match_check_ins
alter column biometric_verified set default false;

alter table public.match_check_ins
alter column biometric_verified set not null;

create table if not exists public.user_passkeys (
  id uuid primary key default gen_random_uuid(),
  credential_id text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  public_key text not null,
  counter integer not null default 0,
  device_type text not null,
  backed_up boolean not null default false,
  transports text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_passkeys_device_type_check
    check (device_type in ('singleDevice', 'multiDevice'))
);

create index if not exists user_passkeys_user_id_idx
  on public.user_passkeys (user_id);

alter table public.user_passkeys enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_passkeys'
      and policyname = 'Users can read their own passkeys'
  ) then
    create policy "Users can read their own passkeys"
    on public.user_passkeys
    for select
    to authenticated
    using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_passkeys'
      and policyname = 'Users can insert their own passkeys'
  ) then
    create policy "Users can insert their own passkeys"
    on public.user_passkeys
    for insert
    to authenticated
    with check (auth.uid() = user_id);
  end if;
end
$$;
