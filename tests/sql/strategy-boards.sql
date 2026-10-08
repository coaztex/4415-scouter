begin;
create function pg_temp.assert_ok(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if SQLSTATE=expected then return; end if; raise exception 'Expected %, got %: %',expected,SQLSTATE,SQLERRM; end; raise exception 'Expected failure'; end $$;
insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000091'),('00000000-0000-0000-0000-000000000092'),('00000000-0000-0000-0000-000000000093'),('00000000-0000-0000-0000-000000000094');
update public.profiles set active=true,approval_pending=false where id in ('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000093');
update public.profiles set role='strategy' where id in ('00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000094');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-000000000093';
insert into public.events(id,tba_key,year,name,game_slug,created_by) values
 ('10000000-0000-0000-0000-000000000091','2026board',2026,'Board fixture','2026-rebuilt','00000000-0000-0000-0000-000000000093'),
 ('10000000-0000-0000-0000-000000000092','2026otherboard',2026,'Other board','2026-rebuilt','00000000-0000-0000-0000-000000000093');
insert into public.matches(id,event_id,tba_match_key,comp_level,set_number,match_number) values
 ('20000000-0000-0000-0000-000000000091','10000000-0000-0000-0000-000000000091','2026board_qm1','qm',1,1),
 ('20000000-0000-0000-0000-000000000092','10000000-0000-0000-0000-000000000091','2026board_qm2','qm',1,2);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000091',true);
select pg_temp.expect_error($s$select public.save_strategy_board('10000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091',0,'{"schemaVersion":1,"gameSlug":"2026-rebuilt","phases":{}}')$s$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000094',true);
select pg_temp.expect_error($s$select public.save_strategy_board('10000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091',0,'{"schemaVersion":1,"gameSlug":"2026-rebuilt","phases":{}}')$s$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000092',true);
select pg_temp.expect_error($s$select public.save_strategy_board('10000000-0000-0000-0000-000000000092','20000000-0000-0000-0000-000000000091',0,'{"schemaVersion":1,"gameSlug":"2026-rebuilt","phases":{}}')$s$,'23503');
select pg_temp.assert_ok(public.save_strategy_board('10000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091',0,'{"schemaVersion":1,"gameSlug":"2026-rebuilt","phases":{"auto":{"notes":"Auto note"},"transition":{"notes":"Transition note"}}}')=1,'First save revision');
select pg_temp.assert_ok((select board_data#>>'{phases,transition,notes}'='Transition note' from public.strategy_boards),'Phase JSON persistence');
select pg_temp.assert_ok((select count(*)=0 from public.strategy_boards where match_id='20000000-0000-0000-0000-000000000092'),'Match leaked');
select pg_temp.expect_error($s$update public.strategy_boards set revision=100$s$,'42501');
select pg_temp.expect_error($s$select public.save_strategy_board('10000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091',0,'{"schemaVersion":1,"gameSlug":"2026-rebuilt","phases":{}}')$s$,'P0001');
select pg_temp.assert_ok(public.save_strategy_board('10000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091',1,'{"schemaVersion":1,"gameSlug":"2026-rebuilt","phases":{"auto":{"notes":"Updated"}}}')=2,'Updated revision');
select pg_temp.expect_error($s$select public.save_strategy_board('10000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091',1,'{"schemaVersion":1,"gameSlug":"2026-rebuilt","phases":{}}')$s$,'P0001');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000091',true);
select pg_temp.assert_ok((select count(*)=0 from public.strategy_boards),'Scout read board');
select pg_temp.assert_ok((select board_data#>>'{phases,auto,notes}'='' from public.read_strategy_board_map('10000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091')),'Scout map leaked notes');
select pg_temp.assert_ok((select count(*)=0 from public.read_strategy_board_map('10000000-0000-0000-0000-000000000092','20000000-0000-0000-0000-000000000091')),'Wrong event leaked map');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000094',true);
select pg_temp.expect_error($s$select * from public.read_strategy_board_map('10000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091')$s$,'42501');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000093',true);
select pg_temp.assert_ok((select count(*)=1 from public.strategy_boards),'Admin read board');
update public.events set status='archived' where tba_key='2026board';
select pg_temp.expect_error($s$select public.save_strategy_board('10000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091',2,'{"schemaVersion":1,"gameSlug":"2026-rebuilt","phases":{}}')$s$,'42501');
select pg_temp.assert_ok((select count(*)=1 from public.strategy_boards),'Admin archived read');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000091',true);
select pg_temp.expect_error($s$select * from public.read_strategy_board_map('10000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091')$s$,'42501');
set local role anon;
select pg_temp.expect_error($s$select * from public.read_strategy_board_map('10000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091')$s$,'42501');
select pg_temp.expect_error($s$select * from public.strategy_boards$s$,'42501');
select pg_temp.expect_error($s$select public.save_strategy_board('10000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000091',2,'{}')$s$,'42501');
rollback;
