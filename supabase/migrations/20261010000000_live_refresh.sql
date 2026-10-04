begin;

-- A lease spans the external HTTP requests, unlike a transaction advisory lock.
create table public.tba_refresh_leases (
  event_id uuid primary key references public.events(id) on delete cascade,
  token uuid,
  expires_at timestamptz,
  last_attempt_at timestamptz
);
alter table public.tba_refresh_leases enable row level security;
revoke all on public.tba_refresh_leases from public, anon, authenticated;
grant select, insert, update on public.tba_refresh_leases to service_role;

create function public.claim_tba_refresh(target_key text, minimum_age_seconds integer, forced boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target public.events%rowtype;
  lease public.tba_refresh_leases%rowtype;
  claimed uuid := gen_random_uuid();
  checked_at timestamptz := clock_timestamp();
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if minimum_age_seconds < 0 or minimum_age_seconds > 86400 then raise exception 'Invalid refresh interval' using errcode='23514'; end if;
  select * into target from public.events where tba_key = target_key for update;
  if not found then return null; end if;
  select * into lease from public.tba_refresh_leases where event_id = target.id;
  if lease.expires_at > checked_at then return null; end if;
  if not forced and (
    target.last_tba_sync_at > checked_at - make_interval(secs => minimum_age_seconds)
    or lease.last_attempt_at > checked_at - make_interval(secs => minimum_age_seconds)
  ) then return null; end if;
  insert into public.tba_refresh_leases(event_id, token, expires_at, last_attempt_at)
  values(target.id, claimed, checked_at + interval '5 minutes', checked_at)
  on conflict(event_id) do update set token = excluded.token, expires_at = excluded.expires_at, last_attempt_at = excluded.last_attempt_at;
  return claimed;
end $$;
revoke all on function public.claim_tba_refresh(text, integer, boolean) from public, anon, authenticated;
grant execute on function public.claim_tba_refresh(text, integer, boolean) to service_role;

create function public.release_tba_refresh(target_key text, claimed uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update public.tba_refresh_leases l set token = null, expires_at = null
  from public.events e where e.id = l.event_id and e.tba_key = target_key and l.token = claimed;
end $$;
revoke all on function public.release_tba_refresh(text, uuid) from public, anon, authenticated;
grant execute on function public.release_tba_refresh(text, uuid) to service_role;

create table public.tba_webhook_verification (
  id boolean primary key default true check (id),
  verification_key text not null check (length(verification_key) <= 200),
  received_at timestamptz not null default now()
);
alter table public.tba_webhook_verification enable row level security;
revoke all on public.tba_webhook_verification from public, anon, authenticated;
grant select, insert, update on public.tba_webhook_verification to service_role;

-- Only these rows are broadcast. Existing SELECT RLS still scopes delivery.
do $$
declare relation_name text;
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach relation_name in array array['events','event_teams','scouting_assignments','match_scouting_submissions'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=relation_name) then
        execute format('alter publication supabase_realtime add table public.%I', relation_name);
      end if;
    end loop;
  end if;
end $$;

-- The automated service may commit snapshots for existing events only; it cannot create an event without an admin creator.
create or replace function public.apply_tba_snapshot(payload jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
 ev jsonb := payload->'event'; eid uuid; mid uuid; t jsonb; m jsonb; a jsonb; r jsonb;
 color text; team_key text; team_no integer; station_no integer;
 attempted timestamptz := (payload->>'attemptedAt')::timestamptz; creator uuid;
begin
 if current_role <> 'service_role' then
  if not private.has_role('admin') then raise exception 'Admin required' using errcode='42501'; end if;
  creator := auth.uid();
 else
  select created_by into creator from public.events where tba_key=ev->>'key';
  if creator is null then raise exception 'Automated sync cannot import a new event' using errcode='42501'; end if;
 end if;
 if attempted is null or jsonb_typeof(payload->'teams') <> 'array' or jsonb_typeof(payload->'matches') <> 'array' then
  raise exception 'Invalid snapshot' using errcode='23514';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(ev->>'key',0));
 select id into eid from public.events where tba_key=ev->>'key';
 if eid is not null then
  if exists(select 1 from public.events where id=eid and (game_slug<>payload->>'gameSlug' or last_tba_sync_at > attempted)) then
   raise exception 'Game mismatch or stale snapshot' using errcode='23514';
  end if;
 end if;
 insert into public.events(tba_key,year,name,short_name,event_type,city,state,country,start_date,end_date,game_slug,created_by,last_tba_sync_at,timezone,timezone_source,source_metadata)
 values(ev->>'key',(ev->>'year')::integer,ev->>'name',ev->>'short_name',(ev->>'event_type')::integer,ev->>'city',ev->>'state_prov',ev->>'country',(ev->>'start_date')::date,(ev->>'end_date')::date,payload->>'gameSlug',creator,attempted,coalesce(ev->>'timezone','UTC'),case when ev->>'timezone' is null then 'default' else 'tba' end,jsonb_build_object('tba',jsonb_build_object('alliances',payload->'alliances','cache',payload->'cache')))
 on conflict(tba_key) do update set name=excluded.name, short_name=excluded.short_name,event_type=excluded.event_type,city=excluded.city,state=excluded.state,country=excluded.country,start_date=excluded.start_date,end_date=excluded.end_date,last_tba_sync_at=excluded.last_tba_sync_at,timezone=case when public.events.timezone_source='admin' or ev->>'timezone' is null then public.events.timezone else excluded.timezone end,timezone_source=case when public.events.timezone_source='admin' or ev->>'timezone' is null then public.events.timezone_source else excluded.timezone_source end,source_metadata=public.events.source_metadata || excluded.source_metadata
 returning id into eid;

 for t in select value from jsonb_array_elements(payload->'teams') loop
  insert into public.teams(team_number,tba_team_key,nickname,name,city,state,country,rookie_year,website)
  values((t->>'team_number')::integer,t->>'key',t->>'nickname',t->>'name',t->>'city',t->>'state_prov',t->>'country',(t->>'rookie_year')::integer,t->>'website')
  on conflict(team_number) do update set nickname=excluded.nickname,name=excluded.name,city=excluded.city,state=excluded.state,country=excluded.country,rookie_year=excluded.rookie_year,website=excluded.website;
  insert into public.event_teams(event_id,team_number) values(eid,(t->>'team_number')::integer) on conflict do nothing;
 end loop;

 for m in select value from jsonb_array_elements(payload->'matches') loop
  if m->>'event_key' <> ev->>'key' then raise exception 'Cross-event match' using errcode='23514'; end if;
  insert into public.matches(event_id,tba_match_key,comp_level,set_number,match_number,scheduled_time,predicted_time,actual_time,winning_alliance,result_metadata,raw_tba_payload)
  values(eid,m->>'key',m->>'comp_level',(m->>'set_number')::integer,(m->>'match_number')::integer,to_timestamp((m->>'time')::double precision),to_timestamp((m->>'predicted_time')::double precision),to_timestamp((m->>'actual_time')::double precision),nullif(m->>'winning_alliance','')::public.alliance_color,jsonb_build_object('red_score',m#>'{alliances,red,score}','blue_score',m#>'{alliances,blue,score}'),jsonb_strip_nulls(jsonb_build_object('score_breakdown',m->'score_breakdown','post_result_time',m->'post_result_time','videos',m->'videos')))
  on conflict(tba_match_key) do update set scheduled_time=excluded.scheduled_time,predicted_time=excluded.predicted_time,actual_time=excluded.actual_time,winning_alliance=excluded.winning_alliance,result_metadata=excluded.result_metadata,raw_tba_payload=coalesce(public.matches.raw_tba_payload,'{}'::jsonb) || excluded.raw_tba_payload
  returning id into mid;
  -- A removed team with scouting/assignment references intentionally causes an FK
  -- failure and rollback. Never erase or retarget historical scouting to sync.
  delete from public.match_teams mt where mt.match_id=mid and not exists (
   select 1 from jsonb_array_elements_text((m#>'{alliances,red,team_keys}') || (m#>'{alliances,blue,team_keys}')) k where k.value='frc'||mt.team_number::text
  );
  foreach color in array array['red','blue'] loop
   a := m->'alliances'->color; station_no := 0;
   for team_key in select jsonb_array_elements_text(a->'team_keys') loop
    station_no := station_no + 1; team_no := substring(team_key from 4)::integer;
    insert into public.match_teams(match_id,event_id,team_number,alliance,station,surrogate,dq)
    values(mid,eid,team_no,color::public.alliance_color,station_no,
      case when a ? 'surrogate_team_keys' then (a->'surrogate_team_keys') ? team_key else null end,
      case when a ? 'dq_team_keys' then (a->'dq_team_keys') ? team_key else null end)
    on conflict(match_id,team_number) do update set alliance=excluded.alliance,station=excluded.station,surrogate=excluded.surrogate,dq=excluded.dq;
   end loop;
  end loop;
 end loop;

 -- An absent optional endpoint preserves previous cache. An explicit [] clears
 -- the rankings snapshot. Never infer a ranking-score meaning from sort order.
 if jsonb_typeof(payload#>'{rankings,rankings}')='array' then
  delete from public.event_rankings where event_id=eid;
  for r in select value from jsonb_array_elements(payload#>'{rankings,rankings}') loop
   insert into public.event_rankings(event_id,team_number,rank,wins,losses,ties,payload,source_updated_at)
   values(eid,substring(r->>'team_key' from 4)::integer,(r->>'rank')::integer,(r#>>'{record,wins}')::integer,(r#>>'{record,losses}')::integer,(r#>>'{record,ties}')::integer,jsonb_build_object('sort_orders',r->'sort_orders','sort_order_info',payload#>'{rankings,sort_order_info}'),null);
  end loop;
 end if;
 if jsonb_typeof(payload->'oprs')='object' then
  for t in select value from jsonb_array_elements(payload->'teams') loop
   team_key := t->>'key';
   insert into public.external_team_metrics(event_id,team_number,source,metric_version,opr,dpr,ccwm,payload,fetched_at)
   values(eid,(t->>'team_number')::integer,'tba','v3-oprs-1',(payload#>>array['oprs','oprs',team_key])::double precision,(payload#>>array['oprs','dprs',team_key])::double precision,(payload#>>array['oprs','ccwms',team_key])::double precision,'{}',attempted)
   on conflict(event_id,team_number,source) do update set opr=excluded.opr,dpr=excluded.dpr,ccwm=excluded.ccwm,metric_version=excluded.metric_version,fetched_at=excluded.fetched_at;
  end loop;
 end if;
 -- A missing COPR endpoint preserves existing components. An explicit object
 -- replaces the per-team source map, including future keys, without new columns.
 if jsonb_typeof(payload->'coprs')='object' then
  for t in select value from jsonb_array_elements(payload->'teams') loop
   team_key := t->>'key';
   select coalesce(jsonb_object_agg(component.key,component.value->team_key),'{}'::jsonb)
   into r from jsonb_each(payload->'coprs') component where component.value ? team_key;
   insert into public.external_team_metrics(event_id,team_number,source,metric_version,payload,fetched_at)
   values(eid,(t->>'team_number')::integer,'tba','v3-oprs-coprs-2',jsonb_build_object('coprs',r),attempted)
   on conflict(event_id,team_number,source) do update set
    payload=public.external_team_metrics.payload || excluded.payload,
    metric_version=excluded.metric_version,fetched_at=excluded.fetched_at;
  end loop;
 end if;
 insert into public.event_sync_state(event_id,source,last_attempt_at,last_success_at,status,last_error)
 values(eid,'tba',attempted,clock_timestamp(),'succeeded',null)
 on conflict(event_id,source) do update set last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,status='succeeded',last_error=null;
 return eid;
end $$;
revoke all on function public.apply_tba_snapshot(jsonb) from public, anon;
grant execute on function public.apply_tba_snapshot(jsonb) to authenticated, service_role;

commit;







