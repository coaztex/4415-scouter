-- Disposable PostgreSQL only; apply Auth fixture and all migrations first.
begin;
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

create function pg_temp.stat_snapshot() returns jsonb language sql as $$
 select jsonb_build_object('event',jsonb_build_object('id',id,'tba_key',tba_key),'attemptedAt','2026-09-23T13:00:00Z','rows',
 '[{"team_number":1,"event_key":"2026fixture","epa_total":0,"epa_auto":0,"epa_teleop":3,"epa_endgame":null,"source_updated_at":null,"payload":{"epa":{"custom":7}}},
 {"team_number":999,"event_key":"2026fixture","epa_total":100,"payload":{}}]'::jsonb) from public.events;
$$;
select public.apply_statbotics_snapshot(pg_temp.stat_snapshot());
select public.apply_statbotics_snapshot(pg_temp.stat_snapshot());
select pg_temp.assert_ok((select count(*)=1 from public.external_team_metrics where source='statbotics'),'Duplicates or non-attendee persisted');
select pg_temp.assert_ok((select epa_total=0 and epa_auto=0 and epa_teleop=3 and epa_endgame is null and source_updated_at is null from public.external_team_metrics where source='statbotics'),'Normalization lost');
select pg_temp.assert_ok((select opr=0 from public.external_team_metrics where source='tba' and team_number=1),'TBA modified');
select public.apply_statbotics_snapshot((pg_temp.stat_snapshot()-'rows') || '{"attemptedAt":"2026-09-23T14:00:00Z","error":"Temporary outage"}');
select pg_temp.assert_ok((select status='failed' and last_success_at is not null from public.event_sync_state where source='statbotics'),'Failure erased success');
select pg_temp.assert_ok((select count(*)=1 from public.external_team_metrics where source='statbotics'),'Failure erased cache');
do $$ begin
 begin perform public.apply_statbotics_snapshot(pg_temp.stat_snapshot()); raise exception 'Expected stale failure';
 exception when raise_exception then if SQLERRM <> 'Stale Statbotics attempt' then raise; end if; end;
end $$;
select public.apply_statbotics_snapshot(pg_temp.stat_snapshot() || '{"attemptedAt":"2026-09-23T15:00:00Z","rows":[]}');
select pg_temp.assert_ok((select count(*)=1 from public.external_team_metrics where source='statbotics'),'Empty result erased cache');
select pg_temp.assert_ok((select status='succeeded' and last_error is null from public.event_sync_state where source='statbotics'),'Retry failed');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.apply_statbotics_snapshot(pg_temp.stat_snapshot() || '{"attemptedAt":"2026-09-23T16:00:00Z","rows":[]}');
select pg_temp.assert_ok((select status='succeeded' and last_error is null from public.event_sync_state where source='statbotics'),'Service-role retry failed');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',true);
do $$ begin
 begin perform public.apply_statbotics_snapshot(pg_temp.stat_snapshot()); raise exception 'Scout synced';
 exception when insufficient_privilege then null; end;
end $$;
rollback;

