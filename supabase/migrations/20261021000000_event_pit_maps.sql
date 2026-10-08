begin;

alter table public.events add column nexus_event_key text
 check (nexus_event_key is null or nexus_event_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$');

-- One cache per event; normalized assignments remain useful without geometry.
create table public.event_pit_maps (
 event_id uuid primary key references public.events(id),
 source text not null default 'nexus' check (source in ('nexus','manual')),
 source_event_key text,
 layout jsonb,
 raw_source jsonb,
 fetched_at timestamptz,
 status text not null check (status in ('succeeded','partial','unavailable','failed')),
 last_attempt_at timestamptz not null,
 last_attempt_key text,
 last_error text check (last_error is null or length(last_error) <= 1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check ((layout is null) = (fetched_at is null)),
 check (layout is null or (jsonb_typeof(layout)='object' and octet_length(layout::text)<=4000000)),
 check (raw_source is null or (jsonb_typeof(raw_source)='object' and octet_length(raw_source::text)<=4000000))
);
create trigger touch_updated_at before update on public.event_pit_maps
 for each row execute function private.touch_updated_at();
alter table public.event_pit_maps enable row level security;
revoke all on public.event_pit_maps from public,anon,authenticated;
grant select(event_id,source,source_event_key,layout,fetched_at,status,last_attempt_at,last_attempt_key,last_error,updated_at)
 on public.event_pit_maps to authenticated;
grant all on public.event_pit_maps to service_role;
create policy event_pit_maps_read on public.event_pit_maps for select to authenticated
 using (private.can_read_event(event_id));

-- Authorized actions and system syncs share an atomic cache write. Missing or
-- failed resources retain useful cached data; late results cannot win races.
create function public.store_nexus_pit_map(target uuid, source_key text,
 attempted_at timestamptz, fetched_layout jsonb, raw_payload jsonb,
 sync_result text, message text, replace_manual boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
declare e public.events; old public.event_pit_maps; section text;
begin
 if coalesce(auth.role(),'') <> 'service_role' then
  if not private.has_role('strategy') or not private.can_read_event(target) then
   raise exception 'Pit map sync access required' using errcode='42501';
  end if;
 end if;
 select * into e from public.events where id=target for update;
 if not found then raise exception 'Event unavailable' using errcode='23514'; end if;
 if source_key is distinct from coalesce(e.nexus_event_key,e.tba_key) then
  raise exception 'Nexus event key changed' using errcode='40001'; end if;
 if attempted_at is null or sync_result not in ('succeeded','partial','unavailable','failed')
  or (message is not null and length(message)>1000) then
  raise exception 'Invalid pit map sync result' using errcode='23514'; end if;
 if (sync_result in ('succeeded','partial')) <> (fetched_layout is not null) then
  raise exception 'Pit map result and layout disagree' using errcode='23514'; end if;
 if fetched_layout is not null then
  if jsonb_typeof(fetched_layout) is distinct from 'object' or fetched_layout->>'schemaVersion' is distinct from '1'
   or octet_length(fetched_layout::text)>4000000
   or not fetched_layout ?& array['width','height','pits','walls','areas','labels','arrows','assignments'] then
   raise exception 'Invalid normalized pit map' using errcode='23514'; end if;
  foreach section in array array['pits','walls','areas','labels','arrows','assignments'] loop
   if jsonb_typeof(fetched_layout->section) is distinct from 'array' or jsonb_array_length(fetched_layout->section)>2000 then
    raise exception 'Invalid normalized map section' using errcode='23514'; end if;
  end loop;
 end if;
 select * into old from public.event_pit_maps where event_id=target for update;
 if found and (old.last_attempt_at>attempted_at or (old.source='manual' and not replace_manual)) then return false; end if;
 insert into public.event_pit_maps(event_id,source,source_event_key,layout,raw_source,fetched_at,status,last_attempt_at,last_attempt_key,last_error)
 values(target,'nexus',source_key,fetched_layout,raw_payload,
  case when fetched_layout is not null then attempted_at else null end,sync_result,attempted_at,source_key,message)
 on conflict(event_id) do update set
  source=case when fetched_layout is not null then 'nexus' else event_pit_maps.source end,
  source_event_key=case when fetched_layout is not null then source_key else event_pit_maps.source_event_key end,
  layout=coalesce(fetched_layout,event_pit_maps.layout),
  raw_source=case when fetched_layout is not null then raw_payload else event_pit_maps.raw_source end,
  fetched_at=case when fetched_layout is not null then attempted_at else event_pit_maps.fetched_at end,
  status=sync_result,last_attempt_at=attempted_at,last_attempt_key=source_key,last_error=message;
 return true;
end $$;
revoke all on function public.store_nexus_pit_map(uuid,text,timestamptz,jsonb,jsonb,text,text,boolean) from public,anon;
grant execute on function public.store_nexus_pit_map(uuid,text,timestamptz,jsonb,jsonb,text,text,boolean) to authenticated,service_role;

commit;
