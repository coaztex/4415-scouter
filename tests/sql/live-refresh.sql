begin;
create function pg_temp.assert_ok(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;

insert into auth.users(id) values ('00000000-0000-0000-0000-000000000090');
insert into public.events(tba_key,year,name,game_slug,created_by,start_date,end_date)
values ('2026livetest',2026,'Live test','2026-rebuilt','00000000-0000-0000-0000-000000000090','2026-09-28','2026-09-29');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert_ok(public.claim_tba_refresh('2026livetest',300,false) is not null,'First lease not claimed');
select pg_temp.assert_ok(public.claim_tba_refresh('2026livetest',300,true) is null,'Concurrent forced lease was allowed');
select public.release_tba_refresh('2026livetest',(select token from public.tba_refresh_leases));
select pg_temp.assert_ok(public.claim_tba_refresh('2026livetest',300,false) is null,'Attempt cooldown ignored');
select pg_temp.assert_ok(public.claim_tba_refresh('2026livetest',300,true) is not null,'Manual force failed');
select public.release_tba_refresh('2026livetest',(select token from public.tba_refresh_leases));

-- Service-role snapshots can update an existing cached event with its admin creator retained.
select public.apply_tba_snapshot('{
  "event":{"key":"2026livetest","year":2026,"name":"Live test refreshed"},
  "gameSlug":"2026-rebuilt","attemptedAt":"2026-09-28T12:00:00Z",
  "teams":[],"matches":[],"rankings":null,"oprs":null,"alliances":null,"cache":{}
}'::jsonb);
select pg_temp.assert_ok((select name='Live test refreshed' and created_by='00000000-0000-0000-0000-000000000090' from public.events where tba_key='2026livetest'),'Service snapshot failed');
select pg_temp.assert_ok(public.claim_tba_refresh('2026livetest',300,false) is null,'Recent sync was refreshed again');

insert into public.scouting_assignments(event_id,scout_user_id,assignment_type,sequence)
select id,'00000000-0000-0000-0000-000000000090','break',0 from public.events where tba_key='2026livetest';
create temp table before_assignment_delete as select updated_at from public.events where tba_key='2026livetest';
delete from public.scouting_assignments where event_id=(select id from public.events where tba_key='2026livetest');
select pg_temp.assert_ok((select updated_at > (select updated_at from before_assignment_delete) from public.events where tba_key='2026livetest'),'Assignment deletion did not signal event');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $$ begin
  begin
    perform public.claim_tba_refresh('2026livetest',300,true);
    raise exception 'Authenticated user claimed service lease';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
