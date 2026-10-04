begin;

-- Shared sync jobs use the server service role; signed-in callers still need admin.
create or replace function public.apply_statbotics_snapshot(payload jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
 eid uuid := (payload#>>'{event,id}')::uuid;
 attempted timestamptz := (payload->>'attemptedAt')::timestamptz;
 r jsonb;
begin
 if current_role <> 'service_role' and not private.has_role('admin') then raise exception 'Admin required' using errcode='42501'; end if;
 if attempted is null or not exists(select 1 from public.events where id=eid and tba_key=payload#>>'{event,tba_key}') then
  raise exception 'Invalid event snapshot';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('statbotics:'||eid::text,0));
 if exists(select 1 from public.event_sync_state where event_id=eid and source='statbotics' and last_attempt_at>attempted) then
  raise exception 'Stale Statbotics attempt';
 end if;
 if payload ? 'error' then
  insert into public.event_sync_state(event_id,source,last_attempt_at,status,last_error)
  values(eid,'statbotics',attempted,'failed',left(payload->>'error',500))
  on conflict(event_id,source) do update set last_attempt_at=excluded.last_attempt_at,status='failed',last_error=excluded.last_error;
  return;
 end if;
 if jsonb_typeof(payload->'rows') is distinct from 'array' then raise exception 'Invalid metrics'; end if;
 for r in select value from jsonb_array_elements(payload->'rows') loop
  if r->>'event_key' is distinct from payload#>>'{event,tba_key}' then raise exception 'Wrong event'; end if;
  -- Only cache attendees already imported by TBA. Never create teams from a metrics feed.
  if not exists(select 1 from public.event_teams where event_id=eid and team_number=(r->>'team_number')::integer) then continue; end if;
  insert into public.external_team_metrics(event_id,team_number,source,metric_version,epa_total,epa_auto,epa_teleop,epa_endgame,source_updated_at,fetched_at,payload)
  values(eid,(r->>'team_number')::integer,'statbotics','v3-team-event-1',
   (r->>'epa_total')::double precision,(r->>'epa_auto')::double precision,(r->>'epa_teleop')::double precision,(r->>'epa_endgame')::double precision,
   (r->>'source_updated_at')::timestamptz,attempted,r->'payload')
  on conflict(event_id,team_number,source) do update set
   metric_version=excluded.metric_version,epa_total=excluded.epa_total,epa_auto=excluded.epa_auto,
   epa_teleop=excluded.epa_teleop,epa_endgame=excluded.epa_endgame,source_updated_at=excluded.source_updated_at,
   fetched_at=excluded.fetched_at,payload=excluded.payload;
 end loop;
 update public.events set last_statbotics_sync_at=attempted where id=eid;
 insert into public.event_sync_state(event_id,source,last_attempt_at,last_success_at,status,last_error)
 values(eid,'statbotics',attempted,clock_timestamp(),'succeeded',null)
 on conflict(event_id,source) do update set last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,status='succeeded',last_error=null;
end $$;
revoke all on function public.apply_statbotics_snapshot(jsonb) from public, anon;
grant execute on function public.apply_statbotics_snapshot(jsonb) to authenticated, service_role;

commit;
