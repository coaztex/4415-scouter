-- Disposable PostgreSQL only. Requires auth-fixture and both migrations.
-- All fixtures roll back. No competition data is seeded remotely.
begin;
-- Exercise historical row policies/triggers independently of the newer service-only
-- match-write boundary; these temporary grants/policies roll back. capture.sql
-- tests the deployed boundary.
grant insert,update on public.match_scouting_submissions to authenticated;
grant insert,update on public.pit_scouting_submissions to authenticated;
create policy own_submission_insert on public.match_scouting_submissions for insert to authenticated
with check (private.can_scout_event(event_id) and scout_user_id=auth.uid());
create policy own_submission_update on public.match_scouting_submissions for update to authenticated
using (private.can_scout_event(event_id) and scout_user_id=auth.uid())
with check (private.can_scout_event(event_id) and scout_user_id=auth.uid());
create policy own_submission_insert on public.pit_scouting_submissions for insert to authenticated
with check (private.can_scout_event(event_id) and scout_user_id=auth.uid());
create policy own_submission_update on public.pit_scouting_submissions for update to authenticated
using (private.can_scout_event(event_id) and scout_user_id=auth.uid())
with check (private.can_scout_event(event_id) and scout_user_id=auth.uid());
set constraints all immediate;
create function pg_temp.assert_ok(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if SQLSTATE = expected then return; end if;
  raise exception 'Expected %, got %: %', expected, SQLSTATE, SQLERRM;
 end;
 raise exception 'Expected failure: %', statement;
end $$;

insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000010'),
 ('00000000-0000-0000-0000-000000000011'),
 ('00000000-0000-0000-0000-000000000012'),
 ('00000000-0000-0000-0000-000000000013');
update public.profiles set active = true where id in
 ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000012');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000010';
update public.profiles set role = 'strategy' where id = '00000000-0000-0000-0000-000000000012';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
insert into public.events(id,tba_key,year,name,game_slug,created_by) values
 ('10000000-0000-0000-0000-000000000001','2026test',2026,'SQL fixture','2026-test','00000000-0000-0000-0000-000000000010'),
 ('10000000-0000-0000-0000-000000000002','2027test',2027,'Future fixture','2027-test','00000000-0000-0000-0000-000000000010');
insert into public.teams(team_number,tba_team_key) values (1,'frc1'),(2,'frc2');
insert into public.event_teams(event_id,team_number) values
 ('10000000-0000-0000-0000-000000000001',1),('10000000-0000-0000-0000-000000000001',2),('10000000-0000-0000-0000-000000000002',1);
insert into public.matches(id,event_id,tba_match_key,comp_level,set_number,match_number) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026test_qm1','qm',1,1),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','2027test_qm1','qm',1,1);
insert into public.match_teams(match_id,event_id,team_number,alliance,station) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',1,'red',1),
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',2,'blue',1);
select pg_temp.expect_error($s$insert into public.match_teams values ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',1,'red',1,null,null)$s$,'23503');
select pg_temp.expect_error($s$update public.match_teams set alliance='red',station=1 where team_number=2$s$,'23505');
select pg_temp.expect_error($s$update public.matches set tba_match_key='2027test_qm9' where id='20000000-0000-0000-0000-000000000001'$s$,'23514');

-- Fixture setup uses the owner; live assignment writes use scheduling RPCs.
reset role;
insert into public.scouting_assignments(id,event_id,match_id,team_number,scout_user_id,sequence) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,'00000000-0000-0000-0000-000000000011',1);
insert into public.scouting_assignments(event_id,scout_user_id,assignment_type,sequence) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012','break',1);
select pg_temp.expect_error($s$insert into public.scouting_assignments(event_id,match_id,team_number,scout_user_id,sequence) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,'00000000-0000-0000-0000-000000000012',2)$s$,'23505');
select pg_temp.expect_error($s$insert into public.scouting_assignments(event_id,match_id,team_number,scout_user_id,sequence) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',2,'00000000-0000-0000-0000-000000000011',2)$s$,'23505');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select pg_temp.assert_ok((select count(*)=2 from public.events),'Scout event read');
select pg_temp.assert_ok((select count(*)=1 from public.scouting_assignments),'Scout only own assignments');
select pg_temp.expect_error($s$insert into public.events(tba_key,year,name,game_slug,created_by) values ('2026denied',2026,'Denied','2026-test','00000000-0000-0000-0000-000000000011')$s$,'42501');
select pg_temp.expect_error($s$update public.profiles set role='admin' where id=auth.uid()$s$,'42501');
insert into public.match_scouting_submissions(id,client_submission_id,event_id,match_id,team_number,assignment_id,scout_user_id,game_slug,schema_version,game_data) values
 ('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,'30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','2026-test',1,'{}');
select pg_temp.expect_error($s$update public.match_scouting_submissions set game_data='[]'$s$,'23514');
select pg_temp.expect_error($s$update public.match_scouting_submissions set team_number=2$s$,'23514');
update public.match_scouting_submissions set note='draft edit';
update public.match_scouting_submissions set status='final',completed_at=clock_timestamp();
select pg_temp.assert_ok((select revision=3 from public.match_scouting_submissions),'Revision increments');
-- Replay via the actual client UUID conflict path.
insert into public.match_scouting_submissions(id,client_submission_id,event_id,match_id,team_number,assignment_id,scout_user_id,game_slug,schema_version,game_data,status,started_at,completed_at,note)
select id,client_submission_id,event_id,match_id,team_number,assignment_id,scout_user_id,game_slug,schema_version,game_data,status,started_at,completed_at,note from public.match_scouting_submissions
on conflict(client_submission_id) do update set game_data=excluded.game_data;
select pg_temp.assert_ok((select revision=3 from public.match_scouting_submissions),'Replay changed revision');
select pg_temp.expect_error($s$update public.match_scouting_submissions set note='stale retry'$s$,'42501');
select pg_temp.expect_error($s$insert into public.match_scouting_submissions(client_submission_id,event_id,match_id,team_number,assignment_id,scout_user_id,game_slug,schema_version,game_data,status,completed_at) values ('50000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,'30000000-0000-0000-0000-000000000001',auth.uid(),'2026-test',1,'{}','final',clock_timestamp())$s$,'23505');
select pg_temp.expect_error($s$insert into public.match_scouting_submissions(client_submission_id,event_id,match_id,team_number,scout_user_id,game_slug,schema_version,game_data) values (gen_random_uuid(),'10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',1,auth.uid(),'2027-test',1,'{}')$s$,'23503');
insert into public.pit_scouting_submissions(client_submission_id,event_id,team_number,scout_user_id,game_slug,schema_version,game_data) values
 ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',1,auth.uid(),'2026-test',1,'{}');
update public.pit_scouting_submissions set note='pit draft';
update public.pit_scouting_submissions set status='final',completed_at=clock_timestamp();
select pg_temp.expect_error($s$update public.pit_scouting_submissions set note='no'$s$,'42501');
select pg_temp.expect_error($s$insert into public.pit_scouting_submissions(client_submission_id,event_id,team_number,scout_user_id,game_slug,schema_version,game_data) values (gen_random_uuid(),'10000000-0000-0000-0000-000000000001',1,'00000000-0000-0000-0000-000000000012','2026-test',1,'{}')$s$,'42501');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',true);
select pg_temp.assert_ok((select count(*)=1 from public.match_scouting_submissions),'Strategy analysis read');
select pg_temp.assert_ok((select count(*)=2 from public.scouting_assignments),'Strategy assignments read');
with changed as (update public.match_scouting_submissions set note='strategy edit' returning id)
select pg_temp.assert_ok((select count(*)=0 from changed),'Strategy edited another scout');
-- Even a profile admin must use the audited correction RPC for a final row.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
select pg_temp.expect_error($s$update public.match_scouting_submissions set note='admin correction'$s$,'42501');
select pg_temp.expect_error($s$update public.match_scouting_submissions set note='admin correction', correction_reason='Reviewed observation'$s$,'42501');
select pg_temp.assert_ok((select revision=3 from public.match_scouting_submissions),'Direct update revised final row');
update public.events set status='archived' where id='10000000-0000-0000-0000-000000000001';
select pg_temp.assert_ok((select count(*)=2 from public.events),'Admin archive read');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
select pg_temp.assert_ok((select count(*)=1 from public.events),'Archived event leaked');
select pg_temp.assert_ok((select count(*)=0 from public.match_scouting_submissions),'Archived submission leaked');
select pg_temp.expect_error($s$insert into public.pit_scouting_submissions(client_submission_id,event_id,team_number,scout_user_id,game_slug,schema_version,game_data) values (gen_random_uuid(),'10000000-0000-0000-0000-000000000001',1,auth.uid(),'2026-test',1,'{}')$s$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000013',true);
select pg_temp.assert_ok((select count(*)=0 from public.events),'Inactive read leaked');
set local role anon;
select pg_temp.expect_error('select * from public.events','42501');
reset role;
select pg_temp.assert_ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),'Every public table needs RLS');
rollback;
