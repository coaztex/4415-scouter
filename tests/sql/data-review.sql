-- Disposable PostgreSQL only, with all migrations applied. Everything rolls back.
begin;
create function pg_temp.assert_ok(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception '%',message; end if; end$$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$begin begin execute statement; exception when others then if SQLSTATE=expected then return; end if;raise exception 'Expected %, got %: %',expected,SQLSTATE,SQLERRM;end;raise exception 'Expected failure: %',statement;end$$;

insert into auth.users(id) values
 ('00000000-0000-4000-9000-000000000001'),
 ('00000000-0000-4000-9000-000000000002'),
 ('00000000-0000-4000-9000-000000000003');
update public.profiles set active=true where id::text like '00000000-0000-4000-9000-%';
update public.profiles set role='strategy' where id='00000000-0000-4000-9000-000000000002';
insert into public.events(id,tba_key,year,name,game_slug,created_by) values
 ('10000000-0000-4000-9000-000000000001','2026review',2026,'Review fixture','2026-rebuilt','00000000-0000-4000-9000-000000000001');
insert into public.teams(team_number,tba_team_key) values (901,'frc901');
insert into public.event_teams(event_id,team_number) values ('10000000-0000-4000-9000-000000000001',901);
insert into public.matches(id,event_id,tba_match_key,comp_level,set_number,match_number) values
 ('20000000-0000-4000-9000-000000000001','10000000-0000-4000-9000-000000000001','2026review_qm1','qm',1,1);
insert into public.match_teams(match_id,event_id,team_number,alliance,station) values
 ('20000000-0000-4000-9000-000000000001','10000000-0000-4000-9000-000000000001',901,'red',1);
insert into public.match_scouting_submissions(id,client_submission_id,event_id,match_id,team_number,scout_user_id,game_slug,schema_version,game_data,status,completed_at) values
 ('40000000-0000-4000-9000-000000000001','50000000-0000-4000-9000-000000000001','10000000-0000-4000-9000-000000000001','20000000-0000-4000-9000-000000000001',901,'00000000-0000-4000-9000-000000000001','2026-rebuilt',2,'{"value":"original"}','final',now());

set local role service_role;
select pg_temp.expect_error($s$select public.review_scouting_submission('00000000-0000-4000-9000-000000000001','match','40000000-0000-4000-9000-000000000001','reviewed_no_change','checked')$s$,'42501');
select pg_temp.expect_error($s$select public.correct_scouting_submission('00000000-0000-4000-9000-000000000001','match','40000000-0000-4000-9000-000000000001',1,'{"value":"bad"}',2,null,'manual_correction')$s$,'42501');
select public.review_scouting_submission('00000000-0000-4000-9000-000000000002','match','40000000-0000-4000-9000-000000000001','reviewed_no_change','verified live notes');
reset role;
select pg_temp.assert_ok((select revision=1 and game_data='{"value":"original"}'::jsonb from public.match_scouting_submissions where id='40000000-0000-4000-9000-000000000001'),'Reviewed-no-change rewrote canonical data');
select pg_temp.assert_ok((select resolution='reviewed_no_change' from public.scouting_submission_reviews where match_submission_id='40000000-0000-4000-9000-000000000001'),'Reviewed-no-change state missing');

set local role service_role;
select pg_temp.expect_error($s$update public.match_scouting_submissions set game_data='{"value":"bypass"}' where id='40000000-0000-4000-9000-000000000001'$s$,'42501');
select public.correct_scouting_submission('00000000-0000-4000-9000-000000000002','match','40000000-0000-4000-9000-000000000001',1,'{"value":"corrected"}',2,'video verified','video_rescout');
reset role;
select pg_temp.assert_ok((select client_submission_id='50000000-0000-4000-9000-000000000001' and revision=2 and game_data='{"value":"corrected"}'::jsonb and correction_provenance='video_rescout' from public.match_scouting_submissions where id='40000000-0000-4000-9000-000000000001'),'Canonical correction/provenance wrong');
select pg_temp.assert_ok((select count(*)=1 from public.scouting_submission_revisions where match_submission_id='40000000-0000-4000-9000-000000000001' and revision=1 and snapshot->'game_data'='{"value":"original"}'::jsonb),'Original revision was not preserved');
select pg_temp.assert_ok((select resolution='corrected' from public.scouting_submission_reviews where match_submission_id='40000000-0000-4000-9000-000000000001'),'Correction did not resolve review');

insert into public.scouting_sync_conflicts(event_id,actor_user_id,submission_kind,client_submission_id,match_id,team_number,kind,attempted_payload) values
 ('10000000-0000-4000-9000-000000000001','00000000-0000-4000-9000-000000000001','match','50000000-0000-4000-9000-000000000002','20000000-0000-4000-9000-000000000001',901,'duplicate_candidate','{"candidate":1}');
select pg_temp.assert_ok((select count(*)=1 from public.scouting_sync_conflicts where kind='duplicate_candidate' and status='open'),'Duplicate candidate was not queued');
set local role service_role;
select pg_temp.expect_error($s$select public.resolve_sync_conflict('00000000-0000-4000-9000-000000000001',(select id from public.scouting_sync_conflicts limit 1),'reviewed_no_change')$s$,'42501');
select public.resolve_sync_conflict('00000000-0000-4000-9000-000000000002',(select id from public.scouting_sync_conflicts limit 1),'reviewed_no_change');
reset role;
select pg_temp.assert_ok((select status='reviewed_no_change' and attempted_payload='{"candidate":1}'::jsonb from public.scouting_sync_conflicts limit 1),'Duplicate resolution lost the candidate evidence');
select pg_temp.assert_ok((select game_data='{"value":"corrected"}'::jsonb from public.match_scouting_submissions where id='40000000-0000-4000-9000-000000000001'),'Duplicate resolution overwrote canonical data');
insert into public.pit_scouting_submissions(id,client_submission_id,event_id,team_number,scout_user_id,game_slug,schema_version,game_data,status,completed_at) values
 ('60000000-0000-4000-9000-000000000001','70000000-0000-4000-9000-000000000001','10000000-0000-4000-9000-000000000001',901,'00000000-0000-4000-9000-000000000001','2026-rebuilt',2,'{"value":"pit original"}','final',now());
set local role service_role;
select public.correct_scouting_submission('00000000-0000-4000-9000-000000000002','pit','60000000-0000-4000-9000-000000000001',1,'{"value":"pit corrected"}',2,'field entry error','manual_correction');
reset role;
select pg_temp.assert_ok((select revision=2 and client_submission_id='70000000-0000-4000-9000-000000000001' and game_data='{"value":"pit corrected"}'::jsonb from public.pit_scouting_submissions where id='60000000-0000-4000-9000-000000000001'),'Pit correction failed');
select pg_temp.assert_ok((select count(*)=1 from public.scouting_submission_revisions where pit_submission_id='60000000-0000-4000-9000-000000000001' and snapshot->'game_data'='{"value":"pit original"}'::jsonb),'Pit original was not audited');
rollback;
