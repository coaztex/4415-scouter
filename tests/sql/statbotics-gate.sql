begin;
create function pg_temp.assert_ok(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000095');
insert into public.events(tba_key,year,name,game_slug,created_by)
values('2026gate1',2026,'Gate one','2026-rebuilt','00000000-0000-0000-0000-000000000095'),
 ('2026gate2',2026,'Gate two','2026-rebuilt','00000000-0000-0000-0000-000000000095');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create temp table claims as select public.claim_statbotics_sync(id)->>'token' as token from public.events where tba_key='2026gate1';
select pg_temp.assert_ok((select token is not null from claims),'No initial claim');
select pg_temp.assert_ok((select public.claim_statbotics_sync(id)->>'reason'='busy' from public.events where tba_key='2026gate1'),'Same event overlapped');
select pg_temp.assert_ok((select public.claim_statbotics_sync(id)->>'reason'='busy' from public.events where tba_key='2026gate2'),'Different event overlapped');
select public.release_statbotics_sync(gen_random_uuid(),clock_timestamp());
select pg_temp.assert_ok((select token is not null from public.statbotics_sync_gate),'Wrong token released lease');

-- A valid lease can persist a snapshot and a failure without losing EPA or success time.
insert into public.teams(team_number,tba_team_key) values(1,'frc1');
insert into public.event_teams(event_id,team_number) select id,1 from public.events where tba_key='2026gate1';
create function pg_temp.payload() returns jsonb language sql as $$
 select jsonb_build_object('event',jsonb_build_object('id',id,'tba_key',tba_key),'attemptedAt',clock_timestamp(),'rows',
  '[{"team_number":1,"event_key":"2026gate1","epa_total":42,"payload":{"epa":{"total_points":42}}}]'::jsonb)
 from public.events where tba_key='2026gate1';
$$;
select public.store_statbotics_sync((select token::uuid from claims),pg_temp.payload());
select public.store_statbotics_sync((select token::uuid from claims),(pg_temp.payload()-'rows') || '{"error":"Upstream unavailable"}');
select pg_temp.assert_ok((select epa_total=42 from public.external_team_metrics where source='statbotics'),'Failure erased EPA');
select pg_temp.assert_ok((select status='failed' and last_success_at is not null from public.event_sync_state where source='statbotics'),'Failure erased success time');

-- Expired workers cannot commit, and later owners are protected from stale releases.
update public.statbotics_sync_gate set expires_at=clock_timestamp()-interval '1 second';
do $$ begin
 begin perform public.store_statbotics_sync((select token::uuid from claims),pg_temp.payload()); raise exception 'Expired worker wrote';
 exception when object_not_in_prerequisite_state then null; end;
end $$;
create temp table newer as select public.claim_statbotics_sync(id)->>'token' as token from public.events where tba_key='2026gate2';
select public.release_statbotics_sync((select token::uuid from claims),clock_timestamp());
select pg_temp.assert_ok((select token::text=(select token from newer) from public.statbotics_sync_gate),'Stale release cleared newer owner');
do $$ begin
 begin perform public.store_statbotics_sync((select token::uuid from claims),pg_temp.payload()); raise exception 'Stale worker wrote';
 exception when object_not_in_prerequisite_state then null; end;
end $$;
select public.release_statbotics_sync((select token::uuid from newer),clock_timestamp()+interval '120 seconds');
select pg_temp.assert_ok((select public.claim_statbotics_sync(id)->>'reason'='cooldown' from public.events where tba_key='2026gate1'),'Retry-After ignored');
update public.statbotics_sync_gate set next_allowed_at=clock_timestamp()-interval '1 second';
select pg_temp.assert_ok((select public.claim_statbotics_sync(id)->>'token' is not null from public.events where tba_key='2026gate1'),'Cooldown never expired');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
do $$ begin
 begin perform public.claim_statbotics_sync(gen_random_uuid()); raise exception 'Authenticated caller claimed';
 exception when insufficient_privilege then null; end;
 begin perform public.release_statbotics_sync(gen_random_uuid(),clock_timestamp()); raise exception 'Authenticated caller released';
 exception when insufficient_privilege then null; end;
 begin perform public.store_statbotics_sync(gen_random_uuid(),'{}'); raise exception 'Authenticated caller wrote';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
