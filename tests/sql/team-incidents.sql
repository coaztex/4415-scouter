-- Disposable PostgreSQL with migrations applied. All fixture data rolls back.
begin;
create function pg_temp.assert_ok(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if sqlstate=expected then return; end if;
  raise exception 'Expected %, got %: %',expected,sqlstate,sqlerrm;
 end;
 raise exception 'Expected failure: %',statement;
end $$;

insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000401'),
 ('00000000-0000-4000-8000-000000000402'),
 ('00000000-0000-4000-8000-000000000403');
update public.profiles set active=true where id in
 ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000402','00000000-0000-4000-8000-000000000403');
update public.profiles set role='strategy' where id='00000000-0000-4000-8000-000000000403';
insert into public.events(id,tba_key,year,name,game_slug,created_by)
 values ('10000000-0000-4000-8000-000000000401','2026incidentfixture',2026,'Incident fixture','2026-rebuilt','00000000-0000-4000-8000-000000000403');
insert into public.teams(team_number,tba_team_key) values (99401,'frc99401');
insert into public.event_teams(event_id,team_number) values ('10000000-0000-4000-8000-000000000401',99401);
insert into public.matches(id,event_id,tba_match_key,comp_level,set_number,match_number)
 values ('20000000-0000-4000-8000-000000000401','10000000-0000-4000-8000-000000000401','2026incidentfixture_qm1','qm',1,1);
insert into public.match_teams(match_id,event_id,team_number,alliance,station)
 values ('20000000-0000-4000-8000-000000000401','10000000-0000-4000-8000-000000000401',99401,'red',1);
insert into public.scouting_assignments(id,event_id,match_id,team_number,scout_user_id,sequence)
 values ('30000000-0000-4000-8000-000000000401','10000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401',99401,'00000000-0000-4000-8000-000000000401',1);
insert into public.match_scouting_submissions(
 id,client_submission_id,event_id,match_id,team_number,assignment_id,scout_user_id,
 game_slug,schema_version,game_data,status,started_at,completed_at
) values (
 '40000000-0000-4000-8000-000000000401','50000000-0000-4000-8000-000000000401',
 '10000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401',99401,
 '30000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000401',
 '2026-rebuilt',2,
 '{"post_match":{"reliability":"DNF"},"issues":[{"id":"60000000-0000-4000-8000-000000000401","phase":"teleop","at_seconds":60,"observed":{"category":"drivetrain","description":"Stopped moving"},"recovered":"no"}]}',
 'final','2026-01-01 00:00+00','2026-01-01 00:03+00'
);
select pg_temp.assert_ok((select count(*)=1 from public.team_incidents where created_from_submission_id='40000000-0000-4000-8000-000000000401'), 'Projection missing');
select pg_temp.assert_ok((select observed_status='DNF' and observed_issue='drivetrain' and observed_note='Stopped moving' and confirmed_cause is null from public.team_incidents where created_from_submission_id='40000000-0000-4000-8000-000000000401'), 'Observation provenance lost');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000402',true);
select pg_temp.assert_ok((select count(*)=0 from public.team_incidents where team_number=99401),'Other scout saw incident');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000401',true);
select pg_temp.assert_ok((select count(*)=1 from public.team_incidents where team_number=99401),'Source scout cannot read observation');
select pg_temp.expect_error($s$update public.team_incidents set confirmed_cause='guessed' where team_number=99401$s$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000403',true);
select pg_temp.assert_ok((select count(*)=1 from public.team_incidents where team_number=99401),'Strategy cannot review observation');
reset role;

set local role service_role;
select pg_temp.expect_error($s$select public.confirm_team_incident('00000000-0000-4000-8000-000000000401',(select id from public.team_incidents where team_number=99401),'Guessed','strategy_confirmed','No evidence')$s$,'42501');
select public.confirm_team_incident('00000000-0000-4000-8000-000000000403',
 (select id from public.team_incidents where team_number=99401),'Loose cable','team_confirmed','Pit conversation after QM1');
select pg_temp.expect_error($s$select public.confirm_team_incident('00000000-0000-4000-8000-000000000403',(select id from public.team_incidents where team_number=99401),'Other cause','strategy_confirmed','Another story')$s$,'23514');
select pg_temp.expect_error($s$update public.team_incidents set observed_note='rewritten' where team_number=99401$s$,'23514');
reset role;
select pg_temp.assert_ok((select observed_note='Stopped moving' and confirmed_cause='Loose cable' and cause_source='team_confirmed' and reviewed_by='00000000-0000-4000-8000-000000000403' from public.team_incidents where team_number=99401),'Review changed observation or lost provenance');
rollback;
