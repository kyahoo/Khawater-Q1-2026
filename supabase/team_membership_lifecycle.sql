create or replace function public.team_is_locked_for_active_tournament(p_team_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tournament_team_entries tte
    join public.tournaments t
      on t.id = tte.tournament_id
    where tte.team_id = p_team_id
      and t.is_active = true
  );
$$;

create or replace function public.prevent_team_member_changes_after_entry()
returns trigger
language plpgsql
as $$
declare
  v_team_id uuid;
  v_request_role text;
begin
  v_request_role := coalesce(
    current_setting('request.jwt.claim.role', true),
    current_user
  );

  if v_request_role = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  v_team_id := case
    when tg_op = 'DELETE' then old.team_id
    else new.team_id
  end;

  if public.team_is_locked_for_active_tournament(v_team_id) then
    raise exception 'team_locked_after_tournament_entry'
      using detail = 'Team membership is locked after entering the active tournament.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists team_members_locked_after_entry on public.team_members;

create trigger team_members_locked_after_entry
before insert or update or delete on public.team_members
for each row
execute function public.prevent_team_member_changes_after_entry();

create or replace function public.leave_current_team(p_user_id uuid)
returns text
language plpgsql
as $$
declare
  v_team_id uuid;
  v_is_captain boolean;
  v_member_count integer;
  v_new_captain uuid;
begin
  select team_id, is_captain
  into v_team_id, v_is_captain
  from public.team_members
  where user_id = p_user_id;

  if v_team_id is null then
    return 'no_team';
  end if;

  if public.team_is_locked_for_active_tournament(v_team_id) then
    raise exception 'team_locked_after_tournament_entry'
      using detail = 'Team membership is locked after entering the active tournament.';
  end if;

  select count(*)
  into v_member_count
  from public.team_members
  where team_id = v_team_id;

  delete from public.tournament_confirmations tc
  using public.tournaments t
  where tc.tournament_id = t.id
    and tc.user_id = p_user_id
    and t.is_active = true;

  if not v_is_captain then
    delete from public.team_members
    where team_id = v_team_id and user_id = p_user_id;

    return 'left_team';
  end if;

  if v_member_count = 1 then
    delete from public.teams
    where id = v_team_id;

    return 'deleted_team';
  end if;

  select user_id
  into v_new_captain
  from public.team_members
  where team_id = v_team_id and user_id <> p_user_id
  order by created_at asc, user_id asc
  limit 1;

  delete from public.team_members
  where team_id = v_team_id and user_id = p_user_id;

  update public.team_members
  set is_captain = true
  where team_id = v_team_id and user_id = v_new_captain;

  return 'transferred_and_left';
end;
$$;

create or replace function public.delete_team_if_last_captain(p_user_id uuid)
returns text
language plpgsql
as $$
declare
  v_team_id uuid;
  v_is_captain boolean;
  v_member_count integer;
begin
  select team_id, is_captain
  into v_team_id, v_is_captain
  from public.team_members
  where user_id = p_user_id;

  if v_team_id is null then
    return 'no_team';
  end if;

  if public.team_is_locked_for_active_tournament(v_team_id) then
    raise exception 'team_locked_after_tournament_entry'
      using detail = 'Team membership is locked after entering the active tournament.';
  end if;

  if not v_is_captain then
    return 'not_captain';
  end if;

  select count(*)
  into v_member_count
  from public.team_members
  where team_id = v_team_id;

  if v_member_count <> 1 then
    return 'not_last_member';
  end if;

  delete from public.tournament_confirmations tc
  using public.tournaments t
  where tc.tournament_id = t.id
    and tc.user_id = p_user_id
    and t.is_active = true;

  delete from public.teams
  where id = v_team_id;

  return 'deleted_team';
end;
$$;
