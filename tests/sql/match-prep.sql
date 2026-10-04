-- Disposable PostgreSQL only. The transaction rolls back all fixtures.
begin;
create function pg_temp.assert_ok(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if SQLSTATE=expected then return; end if;
  raise exception 'Expected %, got %: %',expected,SQLSTATE,SQLERRM;
 end;
 raise exception 'Expected failure';
end $$;
insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000081'),
 ('00000000-0000-0000-0000-000000000082'),
 ('00000000-0000-0000-0000-000000000083');
update public.profiles set active=true where id in
 ('00000000-0000-0000-0000-000000000081',
  '00000000-0000-0000-0000-000000000082',
  '00000000-0000-0000-0000-000000000083');
update public.profiles set role='strategy' where id='00000000-0000-0000-0000-000000000082';
update public.profiles set role='admin' where id='00000000-0000-0000-0000-000000000083';
insert into public.events(id,tba_key,year,name,game_slug,created_by) values
 ('10000000-0000-0000-0000-000000000081','2026prep',2026,'Prep fixture','2026-rebuilt','00000000-0000-0000-0000-000000000083');
insert into public.teams(team_number,tba_team_key) values (4415,'frc4415');
insert into public.event_teams(event_id,team_number) values ('10000000-0000-0000-0000-000000000081',4415);
insert into public.matches(id,event_id,tba_match_key,comp_level,set_number,match_number) values
 ('20000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000081','2026prep_qm1','qm',1,1);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000081',true);
select pg_temp.expect_error($s$insert into public.match_prep_notes(match_id,event_id,note,updated_by) values ('20000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000081','Scout plan',auth.uid())$s$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000082',true);
insert into public.match_prep_notes(match_id,event_id,note,updated_by) values
 ('20000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000081','Strategy plan',auth.uid());
select pg_temp.assert_ok((select note='Strategy plan' from public.match_prep_notes where match_id='20000000-0000-0000-0000-000000000081'),'Strategy cannot read plan');
update public.match_prep_notes set note='Updated plan',updated_by=auth.uid();
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000081',true);
select pg_temp.assert_ok((select count(*)=0 from public.match_prep_notes),'Scout read strategy plan');
update public.match_prep_notes set note='Scout edit';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000083',true);
update public.events set our_team_number=4415 where tba_key='2026prep';
select pg_temp.assert_ok((select our_team_number=4415 from public.events where tba_key='2026prep'),'Admin team setting unavailable');
update public.events set status='archived' where tba_key='2026prep';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000082',true);
select pg_temp.expect_error($s$insert into public.match_prep_notes(match_id,event_id,note,updated_by) values ('20000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000081','Archived',auth.uid())$s$,'42501');
update public.match_prep_notes set note='Archived edit',updated_by=auth.uid();
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000083',true);
select pg_temp.assert_ok((select note='Updated plan' from public.match_prep_notes),'Archived plan changed');
rollback;
