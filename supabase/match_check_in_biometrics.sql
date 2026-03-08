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
  credential_id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
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
