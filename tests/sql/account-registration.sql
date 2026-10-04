-- Disposable PostgreSQL only; all migrations required.
begin;
create function pg_temp.assert_registration(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.registration_error(statement text, expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if SQLSTATE=expected then return; end if; raise; end; raise exception 'Expected failure: %',statement; end $$;
insert into auth.users(id, raw_user_meta_data) values
('00000000-0000-0000-0000-000000000081','{"username":" Pending_SCOUT ","display_name":" New Scout ","role":"admin","active":true,"approval_pending":false}'),
('00000000-0000-0000-0000-000000000082','{"username":"approval_admin","display_name":"Admin"}'),
('00000000-0000-0000-0000-000000000083','{"username":"reject_scout","display_name":"Rejected Scout"}');
select pg_temp.assert_registration((select username='pending_scout' and display_name='New Scout' and role='scout' and not active and approval_pending from public.profiles where id='00000000-0000-0000-0000-000000000081'),'Unsafe registration defaults');
select pg_temp.registration_error($q$insert into auth.users(id,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000084','{"username":"PENDING_SCOUT"}')$q$,'23505');
select pg_temp.assert_registration(not exists(select 1 from auth.users where id='00000000-0000-0000-0000-000000000084'),'Duplicate signup did not roll back atomically');
update public.profiles set role='admin',active=true where id='00000000-0000-0000-0000-000000000082';
insert into public.events(id,tba_key,year,name,game_slug,created_by) values ('10000000-0000-0000-0000-000000000081','2026registration',2026,'Registration fixture','2026-test','00000000-0000-0000-0000-000000000082');
insert into public.matches(id,event_id,tba_match_key,comp_level,set_number,match_number) values ('20000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000081','2026registration_qm1','qm',1,1);
insert into public.teams(team_number,tba_team_key) values (81,'frc81');
insert into public.event_teams(event_id,team_number) values ('10000000-0000-0000-0000-000000000081',81);
insert into public.match_teams(match_id,event_id,team_number,alliance,station) values ('20000000-0000-0000-0000-000000000081','10000000-0000-0000-0000-000000000081',81,'red',1);
insert into public.match_scouting_submissions(client_submission_id,event_id,match_id,team_number,scout_user_id,game_slug,schema_version,game_data) values (gen_random_uuid(),'10000000-0000-0000-0000-000000000081','20000000-0000-0000-0000-000000000081',81,'00000000-0000-0000-0000-000000000082','2026-test',1,'{}');
create function pg_temp.registration_snapshot(target uuid) returns jsonb language sql as $$ select jsonb_build_object('username',username,'display_name',display_name,'role',role,'active',active,'approval_pending',approval_pending) from public.profiles where id=target $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000081',true);
select pg_temp.assert_registration((select count(id)=1 from public.profiles),'Pending account reads directory');
select pg_temp.assert_registration((select count(*)=0 from public.events),'Pending account reads events');
select pg_temp.assert_registration((select count(*)=0 from public.matches),'Pending account reads matches');
select pg_temp.assert_registration((select count(*)=0 from public.match_scouting_submissions),'Pending account reads scouting');
select pg_temp.assert_registration(not private.has_role('scout') and not private.has_role('admin'),'Pending role privileges');
select pg_temp.registration_error($q$update public.profiles set active=true,approval_pending=false where id=auth.uid()$q$,'42501');
select pg_temp.registration_error($q$select public.admin_save_profile('00000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000081','{}','{}')$q$,'42501');
set local role service_role;
select pg_temp.registration_error($q$select public.admin_save_profile('00000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000081','{}','{}')$q$,'42501');
select public.admin_save_profile('00000000-0000-0000-0000-000000000082','00000000-0000-0000-0000-000000000081',pg_temp.registration_snapshot('00000000-0000-0000-0000-000000000081')||'{"active":true,"approval_pending":false,"role":"scout"}',pg_temp.registration_snapshot('00000000-0000-0000-0000-000000000081'));
select public.admin_save_profile('00000000-0000-0000-0000-000000000082','00000000-0000-0000-0000-000000000083',pg_temp.registration_snapshot('00000000-0000-0000-0000-000000000083')||'{"active":false,"approval_pending":false}',pg_temp.registration_snapshot('00000000-0000-0000-0000-000000000083'));
reset role;
select pg_temp.assert_registration((select active and not approval_pending and role='scout' from public.profiles where id='00000000-0000-0000-0000-000000000081'),'Approval failed');
select pg_temp.assert_registration((select not active and not approval_pending from public.profiles where id='00000000-0000-0000-0000-000000000083'),'Rejection failed');
select pg_temp.assert_registration((select count(*)=2 from public.admin_account_audit),'Approval/rejection audit missing');
select pg_temp.assert_registration((select active_admins=1 from private.admin_guard),'Last-admin guard regressed');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000081',true);
select pg_temp.assert_registration((select count(*)=1 from public.events),'Approved scout cannot read events');
select pg_temp.assert_registration(private.has_role('scout') and not private.has_role('strategy') and not private.has_role('admin'),'Approved scout gained unintended role');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000083',true);
select pg_temp.assert_registration((select count(*)=0 from public.events),'Rejected user reads events');
reset role;
rollback;
