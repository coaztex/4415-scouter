begin;
create function pg_temp.assert_ok(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then if SQLSTATE=expected then return; end if; raise; end;
 raise exception 'Expected failure: %',statement;
end $$;
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000110'),('00000000-0000-0000-0000-000000000111'),('00000000-0000-0000-0000-000000000112');
update public.profiles set active=true,approval_pending=false where id in ('00000000-0000-0000-0000-000000000110','00000000-0000-0000-0000-000000000111');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-000000000110';
insert into public.events(id,tba_key,year,name,game_slug,created_by) values ('10000000-0000-0000-0000-000000000110','2026inspection',2026,'Inspection test','2026-rebuilt','00000000-0000-0000-0000-000000000110');
create function pg_temp.write_inspection(result text,snapshot jsonb default null,at_time timestamptz default '2026-10-08T22:00:00Z',key text default '2026inspection') returns boolean language sql as $$
 select public.store_nexus_inspection('10000000-0000-0000-0000-000000000110',key,at_time,snapshot,result,null);
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000111',true);
select pg_temp.expect_error($s$select pg_temp.write_inspection('succeeded','{"101":{"inspected":true,"status":"complete"}}')$s$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000110',true);
select pg_temp.assert_ok(pg_temp.write_inspection('succeeded','{"101":{"inspected":true,"status":"reinspection","queuePosition":2}}'),'Inspection writes independently of map');
select pg_temp.assert_ok((select count(*)=0 from public.event_pit_maps),'Inspection does not create a map');
select pg_temp.assert_ok(pg_temp.write_inspection('failed',null,'2026-10-08T22:01:00Z'),'Failure recorded');
select pg_temp.assert_ok((select snapshot#>>'{101,status}'='reinspection' and fetched_at='2026-10-08T22:00:00Z' from public.event_nexus_inspections),'Failure preserves snapshot and fetch time');
select pg_temp.assert_ok(not pg_temp.write_inspection('succeeded','{}','2026-10-08T22:00:30Z'),'Older attempt cannot overwrite cache');
select pg_temp.assert_ok(pg_temp.write_inspection('unavailable',null,'2026-10-08T22:02:00Z'),'404 attempt recorded');
select pg_temp.assert_ok((select snapshot#>>'{101,queuePosition}'='2' from public.event_nexus_inspections),'Unavailable retains cached inspection');
select pg_temp.expect_error($s$select pg_temp.write_inspection('succeeded','{"101":{"inspected":"yes"}}','2026-10-08T22:03:00Z')$s$,'23514');
select pg_temp.expect_error($s$select pg_temp.write_inspection('succeeded','{"101":{"queuePosition":-1}}','2026-10-08T22:03:00Z')$s$,'23514');
select pg_temp.expect_error($s$select pg_temp.write_inspection('succeeded','{}','2026-10-08T22:03:00Z','2026wrong')$s$,'40001');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000111',true);
select pg_temp.assert_ok((select count(*)=1 from public.event_nexus_inspections),'Active scouts read normalized inspection');
select pg_temp.expect_error($s$update public.event_nexus_inspections set status='failed'$s$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000112',true);
select pg_temp.assert_ok((select count(*)=0 from public.event_nexus_inspections),'Pending profiles cannot read inspection');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000110',true);
update public.events set status='archived' where tba_key='2026inspection';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000111',true);
select pg_temp.assert_ok((select count(*)=0 from public.event_nexus_inspections),'Archive access enforced');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.assert_ok(pg_temp.write_inspection('succeeded','{"101":{"inspected":true,"status":"complete"}}','2026-10-08T22:04:00Z'),'Service role writes without private helper access');
set local role anon;
select pg_temp.expect_error($s$select * from public.event_nexus_inspections$s$,'42501');
select pg_temp.expect_error($s$select pg_temp.write_inspection('unavailable')$s$,'42501');
rollback;
