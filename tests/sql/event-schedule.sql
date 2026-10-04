-- Disposable PostgreSQL only. Fixtures roll back.
begin;
create function pg_temp.assert_ok(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000031'),('00000000-0000-4000-8000-000000000032');
update public.profiles set active=true where id in ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000032');
insert into public.events(id,tba_key,year,name,game_slug,created_by) values
 ('10000000-0000-4000-8000-000000000031','2026coverage',2026,'Test coverage','2026-rebuilt','00000000-0000-4000-8000-000000000031');
insert into public.teams(team_number,tba_team_key) values (31,'frc31'),(32,'frc32');
insert into public.event_teams(event_id,team_number) select '10000000-0000-4000-8000-000000000031',team_number from public.teams;
insert into public.matches(id,event_id,tba_match_key,comp_level,set_number,match_number) values
 ('20000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000031','2026coverage_qm1','qm',1,1),
 ('20000000-0000-4000-8000-000000000032','10000000-0000-4000-8000-000000000031','2026coverage_qm2','qm',1,2);
insert into public.match_teams(match_id,event_id,team_number,alliance,station)
 select m.id,m.event_id,t.team_number,'red',(t.team_number-30) from public.matches m cross join public.teams t;
insert into public.match_scouting_submissions(client_submission_id,event_id,match_id,team_number,scout_user_id,game_slug,schema_version,game_data,status,completed_at)
 values (gen_random_uuid(),'10000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000031',31,'00000000-0000-4000-8000-000000000031','2026-rebuilt',2,'{}','final',now()),
 (gen_random_uuid(),'10000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000031',32,'00000000-0000-4000-8000-000000000031','2026-rebuilt',2,'{}','draft',null);
select pg_temp.assert_ok((select count(*)=1 from public.scouting_coverage_signal where event_id='10000000-0000-4000-8000-000000000031'),'Scouting writes did not create one event-level signal');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000032',true);
select pg_temp.assert_ok((select count(*)=0 from public.match_scouting_submissions),'Scout read another scout raw report');
select pg_temp.assert_ok((select count(*)=1 from public.scouting_coverage_signal),'Scout could not read safe event-level signal');
select pg_temp.assert_ok((select count(*)=4 from jsonb_array_elements(public.get_event_match_coverage('10000000-0000-4000-8000-000000000031'))),'Coverage should include every canonical slot');
select pg_temp.assert_ok((select count(*)=1 from jsonb_array_elements(public.get_event_match_coverage('10000000-0000-4000-8000-000000000031')) r where r->>'completed_count'='1'),'Exact robot-match final count');
select pg_temp.assert_ok((select count(*)=1 from jsonb_array_elements(public.get_event_match_coverage('10000000-0000-4000-8000-000000000031')) r where r->>'in_progress'='true'),'Exact robot-match draft state');
select pg_temp.assert_ok((select count(*)=2 from jsonb_array_elements(public.get_match_coverage('10000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000031'))),'Targeted coverage contains only selected match slots');
select pg_temp.assert_ok((select count(*)=1 from jsonb_array_elements(public.get_match_coverage('10000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000031')) r where r->>'completed_count'='1'),'Targeted coverage counts canonical finals');
reset role;
update public.profiles set active=false where id='00000000-0000-4000-8000-000000000032';
set local role authenticated;
do $$ begin
 begin perform public.get_event_match_coverage('10000000-0000-4000-8000-000000000031'); raise exception 'Inactive scout accessed coverage';
 exception when insufficient_privilege then null; end;
 begin perform public.get_match_coverage('10000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000031'); raise exception 'Inactive scout accessed targeted coverage';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
