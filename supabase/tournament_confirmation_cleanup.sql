delete from public.tournament_confirmations tc
using public.tournaments t
where tc.tournament_id = t.id
  and t.is_active = true
  and not exists (
    select 1
    from public.team_members tm
    where tm.user_id = tc.user_id
  );
