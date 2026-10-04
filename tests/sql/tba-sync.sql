-- Disposable PostgreSQL only; apply Auth fixture and all migrations first.
begin;
-- Fixture submission for sync-preservation regression; rolls back with this suite.
grant insert,update on public.match_scouting_submissions to authenticated;
-- Pit claim RPCs now own production writes; this fixture still seeds a status.
grant update on public.event_teams to authenticated;
create function pg_temp.assert_ok(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
create function pg_temp.snapshot() returns jsonb language sql as $$
 select '{
 "event":{"key":"2026fixture","year":2026,"name":"Synthetic fixture"},
 "gameSlug":"2026-rebuilt","attemptedAt":"2026-09-23T12:00:00Z",
 "teams":[{"key":"frc1","team_number":1},{"key":"frc2","team_number":2}],
 "matches":[{"key":"2026fixture_qm1","event_key":"2026fixture","comp_level":"qm","set_number":1,"match_number":1,"time":0,"actual_time":null,"predicted_time":null,"winning_alliance":"","alliances":{"red":{"team_keys":["frc1","frc2"],"score":-1,"dq_team_keys":[],"surrogate_team_keys":[]},"blue":{"team_keys":[],"score":-1}}}],
 "rankings":{"rankings":[{"team_key":"frc1","rank":1,"record":{"wins":0,"losses":0,"ties":0},"sort_orders":[0]}]},
 "oprs":{"oprs":{"frc1":0},"dprs":{"frc1":0},"ccwms":{"frc1":0}},
 "alliances":null,"cache":{}
 }'::jsonb;
$$;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000020'),('00000000-0000-0000-0000-000000000021');
update public.profiles set active=true,role='admin' where id='00000000-0000-0000-0000-000000000020';
update public.profiles set active=true where id='00000000-0000-0000-0000-000000000021';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',true);
do $$ begin
 begin perform public.apply_tba_snapshot(pg_temp.snapshot()); raise exception 'Scout imported event';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',true);
select public.apply_tba_snapshot(pg_temp.snapshot());
set constraints all immediate;
select pg_temp.assert_ok((select count(*)=1 from public.events),'Event missing');
select pg_temp.assert_ok((select count(*)=2 from public.event_teams),'Event teams missing');
select pg_temp.assert_ok((select opr=0 and dpr=0 and ccwm=0 from public.external_team_metrics where team_number=1),'Zero metrics lost');
select pg_temp.assert_ok((select scheduled_time=to_timestamp(0) from public.matches),'Epoch zero lost');
select pg_temp.assert_ok((select timezone='UTC' and timezone_source='default' from public.events),'Explicit timezone default missing');
select public.apply_tba_snapshot(jsonb_set(jsonb_set(pg_temp.snapshot(),'{event,timezone}','"America/Los_Angeles"'),'{matches,0,videos}','[{"type":"youtube","key":"abcdefghijk"}]'));
select pg_temp.assert_ok((select timezone='America/Los_Angeles' and timezone_source='tba' from public.events),'Imported timezone missing');
select pg_temp.assert_ok((select raw_tba_payload#>>'{videos,0,key}'='abcdefghijk' from public.matches),'Video metadata missing');
update public.events set timezone='America/New_York',timezone_source='admin';
select public.apply_tba_snapshot(jsonb_set(pg_temp.snapshot(),'{event,timezone}','"America/Los_Angeles"'));
select pg_temp.assert_ok((select timezone='America/New_York' and timezone_source='admin' from public.events),'Sync replaced admin timezone');
do $$ begin
 begin update public.events set timezone='PST'; raise exception 'Abbreviation accepted';
 exception when check_violation then null; end;
end $$;
update public.event_teams set pit_status='completed' where team_number=1;
insert into public.match_scouting_submissions(client_submission_id,event_id,match_id,team_number,scout_user_id,game_slug,schema_version,game_data)
select '60000000-0000-0000-0000-000000000001',event_id,id,1,auth.uid(),'2026-rebuilt',1,'{"test":"preserve"}' from public.matches;
insert into public.team_notes(event_id,team_number,author_user_id,note) select id,1,auth.uid(),'Preserve note' from public.events;
select public.apply_tba_snapshot(pg_temp.snapshot());
select pg_temp.assert_ok((select count(*)=1 from public.events),'Duplicate event');
select pg_temp.assert_ok((select count(*)=1 from public.matches),'Duplicate match');
select pg_temp.assert_ok((select count(*)=2 from public.match_teams),'Duplicate roster');
select pg_temp.assert_ok((select count(*)=1 from public.event_rankings),'Duplicate ranking');
select pg_temp.assert_ok((select pit_status='completed' from public.event_teams where team_number=1),'Pit status overwritten');
select pg_temp.assert_ok((select game_data='{"test":"preserve"}'::jsonb from public.match_scouting_submissions),'Scouting overwritten');
select pg_temp.assert_ok((select count(*)=1 from public.team_notes),'Note overwritten');
-- Swap station order without deleting either referenced match-team row.
set constraints all deferred;
select public.apply_tba_snapshot(jsonb_set(pg_temp.snapshot(),'{matches,0,alliances,red,team_keys}','["frc2","frc1"]'));
set constraints all immediate;
select pg_temp.assert_ok((select station=2 from public.match_teams where team_number=1),'Station swap failed');
do $$ begin
 begin
  perform public.apply_tba_snapshot(jsonb_set(jsonb_set(pg_temp.snapshot(),'{event,name}','"Must roll back"'),'{matches,0,alliances,red,team_keys}','["frc2"]'));
  raise exception 'Deleted roster with scouting reference';
 exception when foreign_key_violation then null; end;
end $$;
select pg_temp.assert_ok((select name='Synthetic fixture' from public.events),'Failed transaction changed event');
select pg_temp.assert_ok((select count(*)=2 from public.match_teams),'Failed transaction changed roster');
select pg_temp.assert_ok((select status='succeeded' and last_error is null from public.event_sync_state),'Success state missing');
do $$ begin
 begin
  perform public.apply_tba_snapshot(jsonb_set(pg_temp.snapshot(),'{attemptedAt}','"2026-09-22T12:00:00Z"'));
  raise exception 'Stale snapshot accepted';
 exception when check_violation then null; end;
end $$;
-- Unavailable optional rankings preserve cache; explicit empty clears cache.
set constraints all deferred;
select public.apply_tba_snapshot(jsonb_set(pg_temp.snapshot(),'{rankings}','null'));
select pg_temp.assert_ok((select count(*)=1 from public.event_rankings),'Unavailable rankings erased cache');
select public.apply_tba_snapshot(jsonb_set(pg_temp.snapshot(),'{rankings,rankings}','[]'));
select pg_temp.assert_ok((select count(*)=0 from public.event_rankings),'Explicit empty ranking snapshot ignored');
set constraints all immediate;
-- Season source data uses the existing JSONB cache, with exact provider keys.
select public.apply_tba_snapshot(
 jsonb_set(pg_temp.snapshot(),'{matches,0,score_breakdown}',
 '{"red":{"hubScore":{"autoCount":0,"teleopCount":20,"totalCount":20},"futureTowerField":7},"blue":{}}')
 || '{"coprs":{"Hub Auto Fuel Count":{"frc1":0},"Hub Teleop Fuel Count":{"frc1":-2},"Future component":{"frc1":12}}}'::jsonb
);
select pg_temp.assert_ok((select raw_tba_payload#>>'{score_breakdown,red,hubScore,autoCount}'='0' from public.matches),'Official zero lost');
select pg_temp.assert_ok((select raw_tba_payload#>>'{score_breakdown,red,futureTowerField}'='7' from public.matches),'Raw breakdown stripped');
select pg_temp.assert_ok((select payload#>>'{coprs,Hub Auto Fuel Count}'='0' and payload#>>'{coprs,Hub Teleop Fuel Count}'='-2' and payload#>>'{coprs,Future component}'='12' and opr=0 from public.external_team_metrics where team_number=1),'COPR/OPR coexistence failed');
select public.apply_tba_snapshot(pg_temp.snapshot());
select pg_temp.assert_ok((select raw_tba_payload is not null from public.matches),'Absent breakdown erased prior cache');
select pg_temp.assert_ok((select payload#>>'{coprs,Future component}'='12' from public.external_team_metrics where team_number=1),'Absent COPRs erased prior cache');
select pg_temp.assert_ok((select game_data='{"test":"preserve"}'::jsonb from public.match_scouting_submissions),'Season sync changed scouting');
rollback;
