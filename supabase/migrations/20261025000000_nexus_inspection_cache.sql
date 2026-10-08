begin;

-- External inspection metadata is independent of pit scouting and map geometry.
create table public.event_nexus_inspections (
 event_id uuid primary key references public.events(id),
 source_event_key text not null,
 snapshot jsonb,
 fetched_at timestamptz,
 last_attempt_at timestamptz not null,
 last_attempt_key text not null,
 status text not null check (status in ('succeeded','unavailable','failed')),
 last_error text check (last_error is null or length(last_error)<=1000),
 check (snapshot is null or (jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=1000000))
);
alter table public.event_nexus_inspections enable row level security;
revoke all on public.event_nexus_inspections from public,anon,authenticated;
grant select on public.event_nexus_inspections to authenticated;
grant all on public.event_nexus_inspections to service_role;
create policy nexus_inspection_read on public.event_nexus_inspections for select to authenticated
 using (private.can_read_event(event_id));

create function public.store_nexus_inspection(target uuid, source_key text,
 attempted_at timestamptz, fetched_snapshot jsonb, sync_result text, message text)
returns boolean language plpgsql security definer set search_path='' as $$
declare e public.events; old public.event_nexus_inspections; item record;
begin
 if coalesce(auth.role(),'') <> 'service_role' then
  if not private.has_role('strategy') or not private.can_read_event(target) then
   raise exception 'Nexus inspection sync access required' using errcode='42501';
  end if;
 end if;
 select * into e from public.events where id=target for update;
 if not found then raise exception 'Event unavailable' using errcode='23514'; end if;
 if source_key is distinct from coalesce(e.nexus_event_key,e.tba_key) then
  raise exception 'Nexus event key changed' using errcode='40001'; end if;
 if attempted_at is null or sync_result is null or sync_result not in ('succeeded','unavailable','failed')
  or (message is not null and length(message)>1000)
  or ((sync_result='succeeded') <> (fetched_snapshot is not null)) then
  raise exception 'Invalid inspection sync result' using errcode='23514'; end if;
 if fetched_snapshot is not null then
  if jsonb_typeof(fetched_snapshot) is distinct from 'object' or octet_length(fetched_snapshot::text)>1000000 then
   raise exception 'Invalid inspection snapshot' using errcode='23514'; end if;
  if (select count(*) from jsonb_each(fetched_snapshot))>2000 then
   raise exception 'Inspection snapshot exceeds supported size' using errcode='23514'; end if;
  for item in select * from jsonb_each(fetched_snapshot) loop
   if item.key !~ '^[1-9][0-9]{0,5}$' or jsonb_typeof(item.value) is distinct from 'object' then
    raise exception 'Invalid inspection team' using errcode='23514'; end if;
   if (item.value ? 'inspected' and jsonb_typeof(item.value->'inspected') not in ('boolean','null'))
    or (item.value ? 'status' and jsonb_typeof(item.value->'status') not in ('string','null'))
    or length(item.value->>'status')>80
    or (item.value ? 'queuePosition' and jsonb_typeof(item.value->'queuePosition') not in ('number','null')) then
    raise exception 'Invalid inspection fields' using errcode='23514'; end if;
   if jsonb_typeof(item.value->'queuePosition')='number' then
    if (item.value->>'queuePosition')::numeric<1 or mod((item.value->>'queuePosition')::numeric,1)<>0 then
     raise exception 'Invalid inspection queue position' using errcode='23514'; end if;
   end if;
  end loop;
 end if;
 select * into old from public.event_nexus_inspections where event_id=target for update;
 if found and old.last_attempt_at>attempted_at then return false; end if;
 insert into public.event_nexus_inspections(event_id,source_event_key,snapshot,fetched_at,last_attempt_at,last_attempt_key,status,last_error)
 values(target,source_key,fetched_snapshot,case when fetched_snapshot is not null then attempted_at else null end,attempted_at,source_key,sync_result,message)
 on conflict(event_id) do update set
  source_event_key=case when fetched_snapshot is not null then source_key else event_nexus_inspections.source_event_key end,
  snapshot=coalesce(fetched_snapshot,event_nexus_inspections.snapshot),
  fetched_at=case when fetched_snapshot is not null then attempted_at else event_nexus_inspections.fetched_at end,
  last_attempt_at=attempted_at,last_attempt_key=source_key,status=sync_result,last_error=message;
 return true;
end $$;
revoke all on function public.store_nexus_inspection(uuid,text,timestamptz,jsonb,text,text) from public,anon;
grant execute on function public.store_nexus_inspection(uuid,text,timestamptz,jsonb,text,text) to authenticated,service_role;

commit;
