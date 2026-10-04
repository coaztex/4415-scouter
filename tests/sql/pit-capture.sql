-- Disposable PostgreSQL only; all fixtures roll back.
begin;
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
 ('00000000-0000-0000-0000-000000000020'),
 ('00000000-0000-0000-0000-000000000021'),
 ('00000000-0000-0000-0000-000000000022');
update public.profiles set active=true where id in
 ('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000021');
update public.profiles set role='strategy',active=true where id='00000000-0000-0000-0000-000000000022';
insert into public.events(id,tba_key,year,name,game_slug,created_by) values
 ('10000000-0000-0000-0000-000000000020','2026pit',2026,'Pit test','2026-rebuilt','00000000-0000-0000-0000-000000000020');
insert into public.teams(team_number,tba_team_key) values (101,'frc101'),(102,'frc102');
insert into public.event_teams(event_id,team_number) values
 ('10000000-0000-0000-0000-000000000020',101),
 ('10000000-0000-0000-0000-000000000020',102);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',true);
select pg_temp.expect_error($s$update public.event_teams set pit_status='completed' where team_number=101$s$,'42501');
select pg_temp.expect_error($s$insert into public.pit_scouting_submissions(client_submission_id,event_id,team_number,scout_user_id,game_slug,schema_version,game_data) values ('50000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000020',101,auth.uid(),'2026-rebuilt',2,'{}')$s$,'42501');
select pg_temp.expect_error($s$select public.claim_pit_team('00000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000020',101,false)$s$,'42501');
reset role;

select public.claim_pit_team('00000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000020',101,false);
select pg_temp.assert_ok((select pit_status='in_progress' and pit_claimed_by='00000000-0000-0000-0000-000000000020' from public.event_teams where team_number=101),'Initial claim');
select pg_temp.expect_error($s$select public.claim_pit_team('00000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000020',101,false)$s$,'40001');
select public.save_pit_capture('00000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000020',101,'50000000-0000-0000-0000-000000000020','{"drivetrain":"unknown"}',false,0,false);
select pg_temp.assert_ok((select count(*)=1 and max(revision)=1 from public.pit_scouting_submissions where team_number=101),'Draft persisted');
select pg_temp.expect_error($s$select public.save_pit_capture('00000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000020',101,'50000000-0000-0000-0000-000000000020','{}',false,5,false)$s$,'40001');
select public.claim_pit_team('00000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000020',101,true);
select pg_temp.assert_ok((select count(*)=1 from public.pit_scouting_submissions where team_number=101 and status='draft'),'Takeover retained first draft');
select pg_temp.expect_error($s$select public.save_pit_capture('00000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000020',101,'50000000-0000-0000-0000-000000000020','{}',true,0,false)$s$,'40001');
select public.save_pit_capture('00000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000020',101,'50000000-0000-0000-0000-000000000021','{"drivetrain":"swerve"}',true,0,false);
select pg_temp.assert_ok((select pit_status='completed' and pit_claimed_by='00000000-0000-0000-0000-000000000021' from public.event_teams where team_number=101),'Final and team status atomic');
select pg_temp.assert_ok((select count(*)=2 and count(*) filter (where status='final')=1 from public.pit_scouting_submissions where team_number=101),'Prior draft remains and one final exists');
select public.save_pit_capture('00000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000020',101,'50000000-0000-0000-0000-000000000021','{"drivetrain":"swerve"}',true,0,false);
select pg_temp.expect_error($s$select public.save_pit_capture('00000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000020',101,'50000000-0000-0000-0000-000000000021','{"drivetrain":"tank"}',true,0,false)$s$,'23514');
select pg_temp.expect_error($s$select public.save_pit_capture('00000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000020',101,'50000000-0000-0000-0000-000000000022','{}',true,0,true)$s$,'23514');
select pg_temp.assert_ok((select pit_status='not_scouted' from public.event_teams where team_number=102),'Other team unchanged');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000022',true);
select pg_temp.assert_ok((select count(*)=2 from public.pit_scouting_submissions),'Strategy reads all pit work');
rollback;
