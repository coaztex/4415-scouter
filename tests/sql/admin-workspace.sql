-- Disposable PostgreSQL only: auth-fixture.sql and all migrations required.
begin;
create function pg_temp.assert_ok(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if SQLSTATE=expected then return; end if; raise; end; raise exception 'Expected failure: %',statement; end $$;
insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000030'),('00000000-0000-0000-0000-000000000031'),('00000000-0000-0000-0000-000000000032');
update public.profiles set active=true,role='admin',username='admin_fixture',display_name='Admin' where id='00000000-0000-0000-0000-000000000030';
update public.profiles set active=true,username='scout_fixture',display_name='Scout' where id='00000000-0000-0000-0000-000000000031';
create function pg_temp.snapshot(target uuid) returns jsonb language sql as $$ select jsonb_build_object('username',username,'display_name',display_name,'role',role,'active',active) from public.profiles where id=target $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000031',true);
select pg_temp.assert_ok((select count(*)=0 from public.profiles where id='00000000-0000-0000-0000-000000000032'),'Scout sees inactive account');
select pg_temp.expect_error($q$update public.profiles set role='admin' where id='00000000-0000-0000-0000-000000000031'$q$,'42501');
select pg_temp.expect_error($q$select public.admin_save_profile('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000031','{}','{}')$q$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000030',true);
select pg_temp.assert_ok((select count(*)=1 from public.profiles where id='00000000-0000-0000-0000-000000000032'),'Admin cannot see inactive account');
select pg_temp.expect_error($q$update public.profiles set active=false where id='00000000-0000-0000-0000-000000000030'$q$,'42501');
select pg_temp.expect_error($q$delete from public.events$q$,'42501');
set local role service_role;
select pg_temp.expect_error($q$select public.admin_save_profile('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000031','{}','{}')$q$,'42501');
select pg_temp.expect_error($q$select public.admin_save_profile('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000030',pg_temp.snapshot('00000000-0000-0000-0000-000000000030')||'{"active":false}',pg_temp.snapshot('00000000-0000-0000-0000-000000000030'))$q$,'23514');
select pg_temp.expect_error($q$delete from public.profiles where id='00000000-0000-0000-0000-000000000030'$q$,'23514');
select public.admin_save_profile('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000031',pg_temp.snapshot('00000000-0000-0000-0000-000000000031')||'{"role":"strategy"}',pg_temp.snapshot('00000000-0000-0000-0000-000000000031'));
select pg_temp.expect_error($q$select public.admin_save_profile('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000031',pg_temp.snapshot('00000000-0000-0000-0000-000000000031'),'{"role":"scout"}')$q$,'40001');
select public.admin_save_profile('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000031',pg_temp.snapshot('00000000-0000-0000-0000-000000000031')||'{"role":"admin"}',pg_temp.snapshot('00000000-0000-0000-0000-000000000031'));
select public.admin_save_profile('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000030',pg_temp.snapshot('00000000-0000-0000-0000-000000000030')||'{"active":false}',pg_temp.snapshot('00000000-0000-0000-0000-000000000030'));
reset role;
select pg_temp.assert_ok((select active_admins=1 from private.admin_guard),'Incorrect guard count');
select pg_temp.assert_ok((select count(*)=3 from public.admin_account_audit),'Audit missing changes');
select pg_temp.assert_ok((select count(*)=1 from public.profiles where active and role='admin'),'No admin remains');
rollback;
