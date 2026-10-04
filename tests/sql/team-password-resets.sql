begin;
create function pg_temp.assert_reset(ok boolean, message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.expect_reset_error(statement text, expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if sqlstate=expected then return; end if; raise; end; raise exception 'Expected error: %',statement; end $$;
insert into auth.users(id,raw_user_meta_data,email) values
('00000000-0000-0000-0000-000000000091','{"username":"reset_admin","display_name":"Admin"}','admin@example.invalid'),
('00000000-0000-0000-0000-000000000092','{"username":"reset_pending","display_name":"Pending"}','pending@example.invalid'),
('00000000-0000-0000-0000-000000000093','{"username":"reset_active","display_name":"Active"}','active@example.invalid');
update public.profiles set role='admin',active=true where id='00000000-0000-0000-0000-000000000091';
update public.profiles set active=true where id='00000000-0000-0000-0000-000000000093';

set local role service_role;
select public.submit_password_reset_request('RESET_PENDING');
select public.submit_password_reset_request('pending@example.invalid');
select public.submit_password_reset_request('missing@example.invalid');
select pg_temp.assert_reset((select count(*)=1 from public.password_reset_requests),'Request deduplication or privacy failed');
select pg_temp.expect_reset_error($q$select public.begin_admin_password_reset('00000000-0000-0000-0000-000000000092',(select id from public.password_reset_requests limit 1))$q$,'42501');
select public.begin_admin_password_reset('00000000-0000-0000-0000-000000000091',(select id from public.password_reset_requests limit 1));
select public.finish_admin_password_reset('00000000-0000-0000-0000-000000000091',(select id from public.password_reset_requests limit 1));
select pg_temp.assert_reset((select not active and approval_pending and must_change_password from public.profiles where id='00000000-0000-0000-0000-000000000092'),'Pending reset bypassed approval');
select pg_temp.assert_reset((select status='resolved' and resolved_by='00000000-0000-0000-0000-000000000091' from public.password_reset_requests limit 1),'Resolution audit missing');
select pg_temp.expect_reset_error($q$select public.complete_required_password_change('00000000-0000-0000-0000-000000000092')$q$,'42501');
select public.admin_save_profile('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000092',
 jsonb_build_object('username','reset_pending','display_name','Pending','role','strategy','active',true,'approval_pending',false),
 jsonb_build_object('username','reset_pending','display_name','Pending','role','scout','active',false,'approval_pending',true,'must_change_password',true));
select pg_temp.assert_reset((select not active and not approval_pending and must_change_password and role='strategy' from public.profiles where id='00000000-0000-0000-0000-000000000092'),'Approval skipped required change');
select public.admin_save_profile('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000092',
 jsonb_build_object('username','reset_pending','display_name','Pending Edited','role','strategy','active',true,'approval_pending',false),
 jsonb_build_object('username','reset_pending','display_name','Pending','role','strategy','active',false,'approval_pending',false,'must_change_password',true));
select pg_temp.assert_reset((select not active and must_change_password and display_name='Pending Edited' from public.profiles where id='00000000-0000-0000-0000-000000000092'),'Admin edit bypassed required change');
select public.complete_required_password_change('00000000-0000-0000-0000-000000000092');
select pg_temp.assert_reset((select active and not approval_pending and not must_change_password and role='strategy' from public.profiles where id='00000000-0000-0000-0000-000000000092'),'Password completion failed');

select public.submit_password_reset_request('reset_active');
select public.begin_admin_password_reset('00000000-0000-0000-0000-000000000091',(select id from public.password_reset_requests where status='pending'));
select pg_temp.assert_reset((select not active and must_change_password from public.profiles where id='00000000-0000-0000-0000-000000000093'),'Active account retained access during reset');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000093',true);
select pg_temp.assert_reset(not private.has_role('scout') and not private.is_active_profile(),'Forced-change account retained role access');
set local role service_role;
select public.finish_admin_password_reset('00000000-0000-0000-0000-000000000091',(select id from public.password_reset_requests where status='pending'));
select public.complete_required_password_change('00000000-0000-0000-0000-000000000093');
select pg_temp.assert_reset((select active and not must_change_password from public.profiles where id='00000000-0000-0000-0000-000000000093'),'Active account not restored');
select public.submit_password_reset_request('admin@example.invalid');
select pg_temp.expect_reset_error($q$select public.begin_admin_password_reset('00000000-0000-0000-0000-000000000091',(select id from public.password_reset_requests where status='pending'))$q$,'23514');
select public.dismiss_admin_password_reset('00000000-0000-0000-0000-000000000091',(select id from public.password_reset_requests where status='pending'));
select pg_temp.assert_reset((select count(*)=0 from public.password_reset_requests where status='pending'),'Dismissal failed');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000093',true);
select pg_temp.assert_reset((select count(*)=0 from public.password_reset_requests),'Ordinary user read reset queue');
select pg_temp.expect_reset_error($q$select public.finish_admin_password_reset('00000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-000000000001')$q$,'42501');
select pg_temp.expect_reset_error($q$select public.complete_required_password_change('00000000-0000-0000-0000-000000000093')$q$,'42501');
reset role;
rollback;
