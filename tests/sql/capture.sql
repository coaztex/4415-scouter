-- Disposable PostgreSQL only, with all migrations applied. Everything rolls back.
begin;
create function pg_temp.assert_ok(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception '%',message; end if; end$$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$begin begin execute statement; exception when others then if SQLSTATE=expected then return; end if;raise exception 'Expected %, got %: %',expected,SQLSTATE,SQLERRM;end;raise exception 'Expected failure: %',statement;end$$;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
update public.profiles set active=true where id::text like '00000000-0000-4000-8000-%';
update public.profiles set role='strategy' where id='00000000-0000-4000-8000-000000000002';
insert into public.events(id,tba_key,year,name,game_slug,created_by) values ('10000000-0000-4000-8000-000000000001','2026capture',2026,'Disposable capture','2026-rebuilt','00000000-0000-4000-8000-000000000001');
insert into public.teams(team_number,tba_team_key) values (1,'frc1'),(2,'frc2');
insert into public.event_teams(event_id,team_number) values ('10000000-0000-4000-8000-000000000001',1),('10000000-0000-4000-8000-000000000001',2);
insert into public.matches(id,event_id,tba_match_key,comp_level,set_number,match_number) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','2026capture_qm1','qm',1,1);
insert into public.match_teams(match_id,event_id,team_number,alliance,station) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'red',1),('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',2,'blue',1);
insert into public.scouting_assignments(id,event_id,match_id,team_number,scout_user_id,sequence) values ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'00000000-0000-4000-8000-000000000001',1),('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',2,'00000000-0000-4000-8000-000000000003',1);
-- Synthetic revised-2026 payload; no production data or external service involved.
create function pg_temp.capture(who integer,team integer,override_allowed boolean default false,
 body jsonb default '{"auto":{"estimated_fuel_scored":10,"start_position":"left","execution_result":"successful","collected_additional_fuel":"yes","climb":{"result":"none"}},"teleop":{"estimated_fuel_scored":25,"activity":{"duration_seconds":140,"transitions":[{"at_seconds":0,"state":"scoring"},{"at_seconds":80,"state":"shuttling_passing"}]}},"issues":[],"post_match":{"observed_role":"scorer","defense_observed":false,"reliability":"normal","climb":"none","fuel_estimate_confidence":"good"}}',
 client integer default 1) returns uuid language sql as $$
 select public.submit_match_capture(('00000000-0000-4000-8000-'||lpad(who::text,12,'0'))::uuid,
 ('30000000-0000-4000-8000-'||lpad(team::text,12,'0'))::uuid,
 case when team=1 then '00000000-0000-4000-8000-000000000001'::uuid else '00000000-0000-4000-8000-000000000003'::uuid end,
 '20000000-0000-4000-8000-000000000001',team,('40000000-0000-4000-8000-'||lpad(client::text,12,'0'))::uuid,body,'2026-01-01 00:00:00+00','2026-01-01 00:03:00+00',override_allowed);
$$;
-- The server's Zod parser separately checks full season JSON; this suite tests
-- the RPC boundary with a representative v2 shape and idempotent submission.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error('select pg_temp.capture(1,1)','42501');
select pg_temp.expect_error($s$insert into public.match_scouting_submissions(client_submission_id,event_id,match_id,team_number,scout_user_id,game_slug,schema_version,game_data) values(gen_random_uuid(),'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,auth.uid(),'2026-rebuilt',2,'{}')$s$,'42501');
select pg_temp.expect_error('update public.match_scouting_submissions set game_data=''{}''','42501');
reset role;
set local role service_role;
select pg_temp.expect_error('select pg_temp.capture(3,1,true)','42501');
select pg_temp.expect_error('select pg_temp.capture(2,1,false)','42501');
select public.start_match_capture('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,false);
reset role;
select pg_temp.assert_ok((select status='in_progress' from public.scouting_assignments where team_number=1),'Start reserves assignment');
set local role service_role;
select pg_temp.expect_error($s$select public.start_match_capture('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001',1,false)$s$,'40001');
select pg_temp.expect_error($s$select pg_temp.capture(1,1,false,'{"issues":[{"confirmed_cause":{}}]}')$s$,'23514');
select pg_temp.capture(1,1);
select pg_temp.capture(1,1);
select pg_temp.expect_error($s$select pg_temp.capture(1,1,false,'{"different":true}')$s$,'23505');
select pg_temp.expect_error($s$select pg_temp.capture(1,1,false,'{}',2)$s$,'23514');
select pg_temp.capture(2,2,true,'{}',2);
reset role;
select pg_temp.assert_ok((select count(*)=2 from public.match_scouting_submissions),'Idempotent exactly two final records');
select pg_temp.assert_ok((select count(*)=2 from public.scouting_assignments where status='submitted'),'Both assignments committed submitted');
select pg_temp.assert_ok((select scout_user_id='00000000-0000-4000-8000-000000000003' and submitted_by_user_id='00000000-0000-4000-8000-000000000002' from public.match_scouting_submissions where team_number=2),'Override retains owner and records actor');
select pg_temp.assert_ok((select revision=1 from public.match_scouting_submissions where team_number=1),'Replay does not revise');
select pg_temp.assert_ok((select schema_version=2 and game_data#>>'{teleop,activity,transitions,1,state}'='shuttling_passing' and game_data#>>'{post_match,fuel_estimate_confidence}'='good' from public.match_scouting_submissions where team_number=1),'Revised 2026 payload was retained');
update public.profiles set active=false where id='00000000-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.expect_error('select pg_temp.capture(1,1)','42501');
reset role;
update public.events set status='archived';
set local role service_role;
select pg_temp.expect_error('select pg_temp.capture(2,2,true,''{}'',2)','42501');
rollback;
