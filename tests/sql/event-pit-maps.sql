-- Disposable PostgreSQL only; fixtures roll back.
begin;
create function pg_temp.assert_ok(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if SQLSTATE=expected then return; end if;
  raise exception 'Expected %, got %: %',expected,SQLSTATE,SQLERRM;
 end;
 raise exception 'Expected failure: %',statement;
end $$;

insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000090'),
 ('00000000-0000-0000-0000-000000000091'),
 ('00000000-0000-0000-0000-000000000092'),
 ('00000000-0000-0000-0000-000000000093');
update public.profiles set active=true,approval_pending=false where id in
 ('00000000-0000-0000-0000-000000000090','00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000092');
update public.profiles set role='strategy' where id='00000000-0000-0000-0000-000000000091';
update public.profiles set role='admin' where id='00000000-0000-0000-0000-000000000092';
insert into public.events(id,tba_key,year,name,game_slug,created_by) values
 ('10000000-0000-0000-0000-000000000090','2026pitmaps',2026,'Pit maps test','2026-rebuilt','00000000-0000-0000-0000-000000000092');
create function pg_temp.write_map(result text,payload jsonb default null,at_time timestamptz default '2026-10-05T12:00:00Z',key text default '2026pitmaps') returns boolean language sql as $$
 select public.store_nexus_pit_map('10000000-0000-0000-0000-000000000090',key,at_time,payload,null,result,
  case when result='failed' then 'Provider unavailable' else null end,false);
$$;
create function pg_temp.layout() returns jsonb language sql as $$ select '{"schemaVersion":1,"width":null,"height":null,"pits":[],"walls":[],"areas":[],"labels":[],"arrows":[],"assignments":[{"teamNumber":101,"pitLabel":"A1"}]}'::jsonb $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000090',true);
select pg_temp.expect_error($s$select pg_temp.write_map('partial',pg_temp.layout())$s$,'42501');
select pg_temp.expect_error($s$insert into public.event_pit_maps(event_id,status,last_attempt_at) values ('10000000-0000-0000-0000-000000000090','failed',now())$s$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000091',true);
select pg_temp.assert_ok(pg_temp.write_map('partial',pg_temp.layout()),'Strategy cache write');
select pg_temp.assert_ok((select layout#>>'{assignments,0,pitLabel}'='A1' from public.event_pit_maps),'Normalized assignments readable');
select pg_temp.expect_error($s$select raw_source from public.event_pit_maps$s$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000090',true);
select pg_temp.assert_ok((select count(event_id)=1 from public.event_pit_maps),'Active scout reads cache');
select pg_temp.expect_error($s$update public.event_pit_maps set status='failed'$s$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000093',true);
select pg_temp.assert_ok((select count(event_id)=0 from public.event_pit_maps),'Pending account has no cache access');
select pg_temp.expect_error($s$select pg_temp.write_map('failed')$s$,'42501');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000092',true);
select pg_temp.assert_ok(pg_temp.write_map('failed',null,'2026-10-05T13:00:00Z'),'Admin failure recorded');
select pg_temp.assert_ok((select layout#>>'{assignments,0,pitLabel}'='A1' and fetched_at='2026-10-05T12:00:00Z' from public.event_pit_maps),'Failure retains last useful snapshot and timestamp');
select pg_temp.assert_ok(not pg_temp.write_map('unavailable',null,'2026-10-05T12:30:00Z'),'Late result cannot overwrite newer attempt');
select pg_temp.expect_error($s$select pg_temp.write_map('succeeded','{}')$s$,'23514');
update public.events set nexus_event_key='demo_alt' where tba_key='2026pitmaps';
select pg_temp.expect_error($s$select pg_temp.write_map('partial',pg_temp.layout(),'2026-10-05T14:00:00Z')$s$,'40001');
select pg_temp.assert_ok(pg_temp.write_map('partial',pg_temp.layout(),'2026-10-05T14:00:00Z','demo_alt'),'Override is canonical to cache write');
update public.events set status='archived' where tba_key='2026pitmaps';
select pg_temp.assert_ok((select count(event_id)=1 from public.event_pit_maps),'Admin reads archived cache');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000091',true);
select pg_temp.assert_ok((select count(event_id)=0 from public.event_pit_maps),'Strategy obeys existing archived-event access');
select pg_temp.expect_error($s$select pg_temp.write_map('unavailable',null,'2026-10-05T15:00:00Z','demo_alt')$s$,'42501');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.assert_ok(pg_temp.write_map('unavailable',null,'2026-10-05T16:00:00Z','demo_alt'),'System write works without private role helper permissions');
reset role;
update public.event_pit_maps set source='manual';
set local role service_role;
select pg_temp.assert_ok(not pg_temp.write_map('partial',pg_temp.layout(),'2026-10-05T17:00:00Z','demo_alt'),'Automatic sync preserves manual layouts');
select pg_temp.assert_ok(public.store_nexus_pit_map('10000000-0000-0000-0000-000000000090','demo_alt','2026-10-05T17:00:00Z',pg_temp.layout(),null,'partial',null,true),'Explicit refresh may replace manual data');
rollback;
