begin;

-- One provider batch at a time across events, processes and Vercel instances.
create table public.statbotics_sync_gate (
 singleton boolean primary key default true check(singleton),
 token uuid,
 event_id uuid references public.events(id) on delete set null,
 expires_at timestamptz,
 next_allowed_at timestamptz not null default '-infinity'
);
insert into public.statbotics_sync_gate(singleton) values(true);
alter table public.statbotics_sync_gate enable row level security;
create policy statbotics_gate_service on public.statbotics_sync_gate for all to service_role using(true) with check(true);
revoke all on public.statbotics_sync_gate from anon, authenticated;
grant select, update on public.statbotics_sync_gate to service_role;

create function public.claim_statbotics_sync(target_event uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare gate public.statbotics_sync_gate%rowtype; claimed uuid := gen_random_uuid(); checked timestamptz := clock_timestamp();
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 if not exists(select 1 from public.events where id=target_event) then raise exception 'Unknown event' using errcode='23503'; end if;
 select * into gate from public.statbotics_sync_gate where singleton for update;
 if gate.expires_at > checked then return jsonb_build_object('token',null,'reason','busy','retryAt',gate.expires_at); end if;
 if gate.next_allowed_at > checked then return jsonb_build_object('token',null,'reason','cooldown','retryAt',gate.next_allowed_at); end if;
 update public.statbotics_sync_gate set token=claimed,event_id=target_event,expires_at=checked + interval '2 minutes' where singleton;
 return jsonb_build_object('token',claimed);
end $$;

-- Fencing and the snapshot write share a transaction: an expired worker cannot overwrite a later sync.
create function public.store_statbotics_sync(claimed uuid, payload jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare gate public.statbotics_sync_gate%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 select * into gate from public.statbotics_sync_gate where singleton for update;
 if gate.token is distinct from claimed or claimed is null or gate.expires_at <= clock_timestamp()
    or gate.event_id is distinct from (payload#>>'{event,id}')::uuid then
  raise exception 'Statbotics sync lease expired or superseded' using errcode='55000';
 end if;
 perform public.apply_statbotics_snapshot(payload);
end $$;

create function public.release_statbotics_sync(claimed uuid, retry_not_before timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 update public.statbotics_sync_gate set token=null,event_id=null,expires_at=null,
  next_allowed_at=greatest(next_allowed_at,retry_not_before,clock_timestamp())
 where singleton and token=claimed;
end $$;
revoke all on function public.claim_statbotics_sync(uuid) from public, anon, authenticated;
revoke all on function public.store_statbotics_sync(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.release_statbotics_sync(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_statbotics_sync(uuid) to service_role;
grant execute on function public.store_statbotics_sync(uuid,jsonb) to service_role;
grant execute on function public.release_statbotics_sync(uuid,timestamptz) to service_role;
commit;
