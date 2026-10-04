-- Run only against a disposable database with the Auth fixture and all migrations.
begin;
create function pg_temp.assert_ok(ok boolean, message text) returns void
language plpgsql as $$begin if ok is distinct from true then raise exception '%', message; end if; end$$;

select pg_temp.assert_ok(not exists (
 select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
), 'A public table lacks RLS');
select pg_temp.assert_ok(not exists (
 select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r'
 and c.relname not in ('tba_refresh_leases','tba_webhook_verification')
 and not exists(select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname)
), 'A public table has no policy');
select pg_temp.assert_ok(not exists (
 select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and (
  has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('anon',c.oid,'INSERT')
  or has_table_privilege('anon',c.oid,'UPDATE') or has_table_privilege('anon',c.oid,'DELETE'))
), 'Anonymous role has a public table grant');
select pg_temp.assert_ok(
 not has_table_privilege('authenticated','public.profiles','UPDATE')
 and not has_table_privilege('authenticated','public.scouting_assignments','UPDATE')
 and not has_table_privilege('authenticated','public.match_scouting_submissions','UPDATE')
 and not has_table_privilege('authenticated','public.pit_scouting_submissions','UPDATE')
 and not has_table_privilege('authenticated','public.scouting_coverage_signal','UPDATE')
 and not has_table_privilege('authenticated','public.scouting_submission_revisions','INSERT'),
 'A protected direct write grant exists');
select pg_temp.assert_ok(not exists (
 select 1 from pg_policies where schemaname='public'
 and tablename in ('match_scouting_submissions','pit_scouting_submissions')
 and policyname like 'own_submission_%'
), 'A legacy scout submission write policy remains');
select pg_temp.assert_ok(not exists (
 select 1 from pg_policies where schemaname='storage' and tablename='objects'
 and cmd in ('INSERT','UPDATE','DELETE','ALL')
), 'Authenticated Storage write policy exists in the fixture');

rollback;
