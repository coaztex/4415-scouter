-- Disposable PostgreSQL only; all fixtures roll back. Apply every migration first.
begin;
-- Isolate submission/assignment triggers with temporary legacy permissions;
-- capture.sql verifies the production service-only write boundary.
grant insert,update on public.match_scouting_submissions to authenticated;
create policy own_submission_insert on public.match_scouting_submissions for insert to authenticated
with check (private.can_scout_event(event_id) and scout_user_id=auth.uid());
create policy own_submission_update on public.match_scouting_submissions for update to authenticated
using (private.can_scout_event(event_id) and scout_user_id=auth.uid())
with check (private.can_scout_event(event_id) and scout_user_id=auth.uid());
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
 ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004'),
 ('00000000-0000-4000-8000-000000000005');
update public.profiles set active=true where id::text like '00000000-0000-4000-8000-%';
update public.profiles set role='admin' where id='00000000-0000-4000-8000-000000000001';
update public.profiles set role='strategy' where id='00000000-0000-4000-8000-000000000002';
update public.profiles set active=false where id='00000000-0000-4000-8000-000000000005';
insert into public.events(id,tba_key,year,name,game_slug,created_by) values
 ('10000000-0000-4000-8000-000000000001','2026sched',2026,'Local fixture','2026-test','00000000-0000-4000-8000-000000000001');
insert into public.teams(team_number,tba_team_key) values (1,'frc1'),(2,'frc2');
insert into public.event_teams(event_id,team_number) values
 ('10000000-0000-4000-8000-000000000001',1),('10000000-0000-4000-8000-000000000001',2);
insert into public.matches(id,event_id,tba_match_key,comp_level,set_number,match_number) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','2026sched_qm1','qm',1,1),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','2026sched_qm2','qm',1,2);
insert into public.match_teams(match_id,event_id,team_number,alliance,station)
 select m.id,m.event_id,t.team_number,case when t.team_number=1 then 'red'::public.alliance_color else 'blue'::public.alliance_color end,1 from public.matches m cross join public.teams t;
-- Local helper deliberately uses invoker permissions, like the real client RPC.
create function pg_temp.save(rows jsonb, remove_ids jsonb default '[]') returns integer language sql as $$
 select public.save_scouting_schedule('10000000-0000-4000-8000-000000000001',
 public.get_schedule_snapshot('10000000-0000-4000-8000-000000000001')->>'version',
 jsonb_build_object('rows',rows,'remove_ids',remove_ids));
$$;
create function pg_temp.row(scout integer, team integer, assignment uuid default null, slot integer default 1, status text default 'assigned') returns jsonb language sql as $$
 select jsonb_build_object('id',assignment,'slot_match_id','20000000-0000-4000-8000-'||lpad(slot::text,12,'0'),
 'team_number',team,'scout_user_id','00000000-0000-4000-8000-'||lpad(scout::text,12,'0'),
 'assignment_type',case when team is null then 'break' else 'match' end,'status',status);
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_ok(jsonb_array_length(public.get_schedule_snapshot('10000000-0000-4000-8000-000000000001')->'data'->'scouts')=4,'Only active scouts');
select pg_temp.assert_ok(pg_temp.save(jsonb_build_array(pg_temp.row(3,1),pg_temp.row(4,2),pg_temp.row(2,null)))=3,'Strategy can save');
select pg_temp.assert_ok((select count(*)=3 from public.scouting_assignments),'Three saved rows');
select pg_temp.expect_error($s$select pg_temp.save(jsonb_build_array(pg_temp.row(3,null)))$s$,'23505');
select pg_temp.expect_error($s$select pg_temp.save(jsonb_build_array(pg_temp.row(5,1,null,2)))$s$,'23514');
select pg_temp.expect_error($s$select pg_temp.save(jsonb_build_array(pg_temp.row(3,99,null,2)))$s$,'23514');
select pg_temp.expect_error($s$select pg_temp.save(jsonb_build_array(pg_temp.row(3,1,null,2,'submitted')))$s$,'23514');
select pg_temp.expect_error($s$select pg_temp.save(jsonb_build_array(pg_temp.row(3,null,null,2,'missed')))$s$,'23514');
select pg_temp.expect_error($s$select public.save_scouting_schedule('10000000-0000-4000-8000-000000000001','stale','{"rows":[],"remove_ids":[]}')$s$,'40001');
-- Preserve stable IDs and creation times while swapping two scouts atomically.
select set_config('test.a1',(select id::text from public.scouting_assignments where team_number=1),true);
select set_config('test.a2',(select id::text from public.scouting_assignments where team_number=2),true);
select set_config('test.break',(select id::text from public.scouting_assignments where assignment_type='break'),true);
select set_config('test.created',(select created_at::text from public.scouting_assignments where team_number=1),true);
select pg_temp.save(jsonb_build_array(pg_temp.row(4,1,current_setting('test.a1')::uuid),pg_temp.row(3,2,current_setting('test.a2')::uuid)));
select pg_temp.assert_ok((select scout_user_id='00000000-0000-4000-8000-000000000004' and created_at=current_setting('test.created')::timestamptz from public.scouting_assignments where id=current_setting('test.a1')::uuid),'Swap identity/time');
-- A later invalid row rolls back earlier deletions/inserts in the same RPC.
select pg_temp.expect_error($s$select pg_temp.save(jsonb_build_array(pg_temp.row(3,1,current_setting('test.a1')::uuid),pg_temp.row(3,1,null,2)))$s$,'23505');
select pg_temp.assert_ok((select count(*)=3 from public.scouting_assignments),'Failed save left no partial rows');
select pg_temp.assert_ok((select scout_user_id='00000000-0000-4000-8000-000000000004' from public.scouting_assignments where id=current_setting('test.a1')::uuid),'Failed swap retained original');
-- Direct REST writes are denied even for an app administrator.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($s$update public.scouting_assignments set status='missed'$s$,'42501');
select pg_temp.expect_error($s$delete from public.scouting_assignments$s$,'42501');
select pg_temp.expect_error($s$insert into public.scouting_assignments(event_id,scout_user_id,assignment_type,sequence) values ('10000000-0000-4000-8000-000000000001',auth.uid(),'break',10)$s$,'42501');
-- Ordinary scouts can only read their own and acknowledge their own breaks.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_ok((select count(*)=1 from public.scouting_assignments),'Own-only assignments');
select pg_temp.expect_error($s$select pg_temp.save('[]')$s$,'42501');
select pg_temp.expect_error($s$select public.finish_scout_break(current_setting('test.break')::uuid)$s$,'42501');
select pg_temp.expect_error($s$select public.finish_scout_break(current_setting('test.a2')::uuid)$s$,'42501');
-- Draft submission locks the assignment, final transitions it to submitted.
insert into public.match_scouting_submissions(client_submission_id,event_id,match_id,team_number,assignment_id,scout_user_id,game_slug,schema_version,game_data)
 values(gen_random_uuid(),'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',2,current_setting('test.a2')::uuid,auth.uid(),'2026-test',1,'{}');
select pg_temp.assert_ok((select status='in_progress' from public.scouting_assignments),'Draft starts assignment');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.expect_error($s$select pg_temp.save('[]',jsonb_build_array(current_setting('test.a2')))$s$,'23514');
select pg_temp.expect_error($s$select pg_temp.save(jsonb_build_array(pg_temp.row(4,2,current_setting('test.a2')::uuid)))$s$,'23514');
select public.finish_scout_break(current_setting('test.break')::uuid);
select public.finish_scout_break(current_setting('test.break')::uuid);
select pg_temp.assert_ok((select status='submitted' from public.scouting_assignments where id=current_setting('test.break')::uuid),'Own break completion is idempotent');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
update public.match_scouting_submissions set status='final',completed_at=now();
select pg_temp.assert_ok((select status='submitted' from public.scouting_assignments),'Final completes assignment');
reset role;
select pg_temp.expect_error($s$update public.scouting_assignments set scout_user_id='00000000-0000-4000-8000-000000000001' where id=current_setting('test.a2')::uuid$s$,'23514');
select pg_temp.expect_error($s$delete from public.scouting_assignments where id=current_setting('test.a2')::uuid$s$,'23514');
select pg_temp.expect_error($s$update public.scouting_assignments set status='assigned' where id=current_setting('test.a2')::uuid$s$,'23514');
-- Editable missed marks and break removal still work.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.save(jsonb_build_array(pg_temp.row(4,1,current_setting('test.a1')::uuid,1,'missed'),pg_temp.row(3,null,null,2)));
select pg_temp.assert_ok((select status='missed' from public.scouting_assignments where id=current_setting('test.a1')::uuid),'Missed mark');
select pg_temp.save('[]', (select jsonb_agg(id) from public.scouting_assignments where break_match_id='20000000-0000-4000-8000-000000000002'));
reset role;
update public.events set status='archived';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($s$select pg_temp.save('[]')$s$,'42501');
set local role anon;
select pg_temp.expect_error($s$select public.get_schedule_snapshot('10000000-0000-4000-8000-000000000001')$s$,'42501');
rollback;
