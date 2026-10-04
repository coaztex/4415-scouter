begin;

create table public.event_picklists (
 event_id uuid primary key references public.events(id),
 state jsonb not null default '{"profiles":{"offense":{"weights":{"fuel":100},"minSamples":3,"minCoverage":0.7},"support":{"weights":{"passing_share":100},"minSamples":3,"minCoverage":0.7},"defense":{"weights":{"defense_frequency":100},"minSamples":3,"minCoverage":0.7},"reliability":{"weights":{"full_match":100},"minSamples":3,"minCoverage":0.7},"auto":{"weights":{"auto_success":75,"auto_fuel":25},"minSamples":3,"minCoverage":0.7},"complement":{"weights":{},"minSamples":3,"minCoverage":0.7}},"strategy":{"strengths":"","needs":""},"controls":{},"manualOrder":[]}',
 revision integer not null default 1 check (revision>0),
 updated_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (jsonb_typeof(state)='object')
);
create table public.picklist_snapshots (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id),
 name text not null check (length(btrim(name)) between 1 and 80),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 revision integer not null,
 state jsonb not null check (jsonb_typeof(state)='object'),
 evidence jsonb not null check (jsonb_typeof(evidence)='object'),
 unique(event_id,name)
);
create index picklist_snapshots_event_idx on public.picklist_snapshots(event_id,created_at desc);

create function private.initialize_event_picklist() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.event_picklists(event_id) values(new.id); return new; end $$;
create trigger initialize_event_picklist after insert on public.events for each row execute function private.initialize_event_picklist();
insert into public.event_picklists(event_id) select id from public.events;

alter table public.event_picklists enable row level security;
alter table public.picklist_snapshots enable row level security;
revoke all on public.event_picklists,public.picklist_snapshots from public,anon,authenticated;
grant select on public.event_picklists,public.picklist_snapshots to authenticated;
grant all on public.event_picklists,public.picklist_snapshots to service_role;
create policy picklists_read on public.event_picklists for select to authenticated using (private.can_read_event(event_id) and private.has_role('strategy'));
create policy snapshots_read on public.picklist_snapshots for select to authenticated using (private.can_read_event(event_id) and private.has_role('strategy'));

create function private.validate_picklist_state(target uuid,payload jsonb) returns void language plpgsql set search_path='' as $$
declare p record; w record; c record; n jsonb; allowed jsonb := '{"offense":["fuel","scoring_share","copr_fuel","epa_teleop"],"support":["passing_share","passer_role"],"defense":["defense_frequency","defense_share","defense_effectiveness"],"reliability":["full_match","availability","issue_free"],"auto":["auto_success","auto_fuel","copr_auto","epa_auto"],"complement":["fuel","scoring_share","copr_fuel","epa_teleop","passing_share","passer_role","defense_frequency","defense_share","defense_effectiveness","full_match","availability","issue_free","auto_success","auto_fuel","copr_auto","epa_auto"]}';
begin
 if jsonb_typeof(payload) is distinct from 'object' or not payload ?& array['profiles','strategy','controls','manualOrder']
 or (select count(*) from jsonb_object_keys(payload))<>4
 or jsonb_typeof(payload->'profiles') is distinct from 'object' or jsonb_typeof(payload->'strategy') is distinct from 'object'
 or jsonb_typeof(payload->'controls') is distinct from 'object' or jsonb_typeof(payload->'manualOrder') is distinct from 'array' then
  raise exception 'Invalid picklist state' using errcode='23514'; end if;
 if not (payload->'profiles') ?& array['offense','support','defense','reliability','auto','complement'] or (select count(*) from jsonb_object_keys(payload->'profiles'))<>6 then raise exception 'Invalid profiles' using errcode='23514'; end if;
 for p in select * from jsonb_each(payload->'profiles') loop
  if jsonb_typeof(p.value->'weights') is distinct from 'object' or jsonb_typeof(p.value->'minSamples') is distinct from 'number' or jsonb_typeof(p.value->'minCoverage') is distinct from 'number'
  or (p.value->>'minSamples')::numeric not between 1 and 20 or (p.value->>'minSamples')::numeric<>trunc((p.value->>'minSamples')::numeric)
  or (p.value->>'minCoverage')::numeric not between 0.1 and 1 then raise exception 'Invalid profile policy' using errcode='23514'; end if;
  for w in select * from jsonb_each(p.value->'weights') loop
   if not (allowed->p.key) ? w.key or jsonb_typeof(w.value) is distinct from 'number' or w.value::text::numeric not between 0 and 100 then raise exception 'Invalid metric weight' using errcode='23514'; end if;
  end loop;
 end loop;
 if jsonb_typeof(payload#>'{strategy,strengths}') is distinct from 'string' or jsonb_typeof(payload#>'{strategy,needs}') is distinct from 'string'
 or length(payload#>>'{strategy,strengths}')>500 or length(payload#>>'{strategy,needs}')>500 then raise exception 'Invalid strategy preferences' using errcode='23514'; end if;
 for c in select * from jsonb_each(payload->'controls') loop
  if c.key !~ '^[1-9][0-9]*$' or not exists(select 1 from public.event_teams where event_id=target and team_number=c.key::integer)
  or jsonb_typeof(c.value->'favorite') is distinct from 'boolean' or jsonb_typeof(c.value->'excluded') is distinct from 'boolean'
  or jsonb_typeof(c.value->'note') is distinct from 'string' or length(c.value->>'note')>500
  or ((c.value->>'excluded')::boolean and length(btrim(c.value->>'note'))=0) then raise exception 'Invalid team control or missing exclusion reason' using errcode='23514'; end if;
 end loop;
 if jsonb_array_length(payload->'manualOrder')>1000 or (select count(distinct value) from jsonb_array_elements(payload->'manualOrder'))<>jsonb_array_length(payload->'manualOrder') then raise exception 'Invalid order' using errcode='23514'; end if;
 for n in select value from jsonb_array_elements(payload->'manualOrder') loop
  if jsonb_typeof(n) is distinct from 'number' or n::text::numeric<>trunc(n::text::numeric) or not exists(select 1 from public.event_teams where event_id=target and team_number=n::text::integer) then raise exception 'Order team not in event' using errcode='23514'; end if;
 end loop;
end $$;

create function public.save_event_picklist(target uuid,expected_revision integer,payload jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare current_revision integer;
begin
 perform 1 from public.profiles where id=auth.uid() and active and role in ('strategy','admin') for share;
 if not found then raise exception 'Strategy access required' using errcode='42501'; end if;
 perform 1 from public.events where id=target and status='active' for share;
 if not found then raise exception 'Active event required' using errcode='42501'; end if;
 select revision into current_revision from public.event_picklists where event_id=target for update;
 if current_revision is distinct from expected_revision then raise exception 'Picklist changed; reload before saving' using errcode='40001'; end if;
 perform private.validate_picklist_state(target,payload);
 update public.event_picklists set state=payload,revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() where event_id=target returning revision into current_revision;
 return current_revision;
end $$;

create function public.create_picklist_snapshot(target uuid,expected_revision integer,snapshot_name text,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare current_state public.event_picklists; result uuid;
begin
 perform 1 from public.profiles where id=auth.uid() and active and role in ('strategy','admin') for share;
 if not found then raise exception 'Strategy access required' using errcode='42501'; end if;
 perform 1 from public.events where id=target and status='active' for share;
 if not found then raise exception 'Active event required' using errcode='42501'; end if;
 select * into current_state from public.event_picklists where event_id=target for share;
 if current_state.revision is distinct from expected_revision then raise exception 'Picklist changed; reload before snapshot' using errcode='40001'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>4000000 then raise exception 'Invalid snapshot evidence' using errcode='23514'; end if;
 insert into public.picklist_snapshots(event_id,name,created_by,revision,state,evidence)
 values(target,btrim(snapshot_name),auth.uid(),current_state.revision,current_state.state,payload) returning id into result;
 return result;
end $$;
revoke all on function private.initialize_event_picklist(),private.validate_picklist_state(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.save_event_picklist(uuid,integer,jsonb),public.create_picklist_snapshot(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.save_event_picklist(uuid,integer,jsonb),public.create_picklist_snapshot(uuid,integer,text,jsonb) to authenticated;
commit;
