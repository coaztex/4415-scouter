begin;

-- PostgREST now supplies JWT claims as a JSON object. auth.role() supports
-- both that format and older claim settings without weakening the RPC grant.
create or replace function public.claim_tba_refresh(target_key text, minimum_age_seconds integer, forced boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target public.events%rowtype;
  lease public.tba_refresh_leases%rowtype;
  claimed uuid := gen_random_uuid();
  checked_at timestamptz := clock_timestamp();
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
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

create or replace function public.release_tba_refresh(target_key text, claimed uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update public.tba_refresh_leases l set token = null, expires_at = null
  from public.events e where e.id = l.event_id and e.tba_key = target_key and l.token = claimed;
end $$;
revoke all on function public.release_tba_refresh(text, uuid) from public, anon, authenticated;
grant execute on function public.release_tba_refresh(text, uuid) to service_role;

commit;
