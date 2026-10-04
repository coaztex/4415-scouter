begin;

-- active remains the authorization gate. Pending is a lifecycle distinction,
-- so existing inactive/disabled accounts are never relabeled as registrations.
alter table public.profiles add column approval_pending boolean not null default false;
alter table public.profiles add constraint profiles_pending_inactive check (not (active and approval_pending));
grant select (approval_pending) on public.profiles to authenticated;

create or replace function private.create_auth_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare requested_username text; requested_name text;
begin
  requested_username := lower(btrim(new.raw_user_meta_data->>'username'));
  requested_name := btrim(new.raw_user_meta_data->>'display_name');
  if requested_username is null or requested_username !~ '^[a-z0-9_]{3,40}$' then
    requested_username := 'scout_' || replace(new.id::text, '-', '');
  end if;
  if requested_name is null or char_length(requested_name) > 100 then requested_name := ''; end if;
  -- Identity metadata is validated; role, active and pending metadata are ignored.
  -- The unique constraint makes concurrent username signup collisions atomic.
  insert into public.profiles (id, username, display_name, role, active, approval_pending)
  values (new.id, requested_username, requested_name, 'scout', false, true);
  return new;
end;
$$;

create or replace function private.normalize_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.username := lower(btrim(new.username));
  if new.active then new.approval_pending := false; end if;
  if TG_OP = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
    new.updated_at := clock_timestamp();
  end if;
  return new;
end;
$$;

-- Extend the existing audited admin operation, retaining actor rechecks,
-- optimistic concurrency, last-admin trigger and service-only execution.
create or replace function public.admin_save_profile(actor_id uuid, target_id uuid, changes jsonb, expected jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles; before_value jsonb; after_value jsonb; comparison jsonb;
begin
 perform 1 from public.profiles where id=actor_id and active and role='admin' for share;
 if not found then raise exception 'admin_required' using errcode='42501'; end if;
 select * into p from public.profiles where id=target_id for update;
 if not found then raise exception 'profile_not_found' using errcode='P0002'; end if;
 before_value := jsonb_build_object('username',p.username,'display_name',p.display_name,'role',p.role,'active',p.active,'approval_pending',p.approval_pending);
 -- Support the preceding app version during migration/deployment rollout.
 comparison := case when expected ? 'approval_pending' then before_value else before_value - 'approval_pending' end;
 if comparison is distinct from expected then raise exception 'profile_changed' using errcode='40001'; end if;
 if jsonb_typeof(changes->'active') is distinct from 'boolean'
 or nullif(btrim(changes->>'display_name'),'') is null
 or jsonb_typeof(changes->'username') is distinct from 'string'
 or (changes->>'role') is null
 or (changes ? 'approval_pending' and jsonb_typeof(changes->'approval_pending') is distinct from 'boolean')
 then raise exception 'invalid_profile' using errcode='23514'; end if;
 update public.profiles set username=changes->>'username',display_name=btrim(changes->>'display_name'),
 role=(changes->>'role')::public.profile_role, active=(changes->>'active')::boolean,
 approval_pending=case when (changes->>'active')::boolean then false
   when changes ? 'approval_pending' then (changes->>'approval_pending')::boolean else p.approval_pending end
 where id=target_id;
 select jsonb_build_object('username',username,'display_name',display_name,'role',role,'active',active,'approval_pending',approval_pending)
 into after_value from public.profiles where id=target_id;
 if before_value is distinct from after_value then
  insert into public.admin_account_audit(actor_id,target_id,before_values,after_values)
  values(actor_id,target_id,before_value,after_value);
 end if;
end $$;
revoke all on function public.admin_save_profile(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.admin_save_profile(uuid,uuid,jsonb,jsonb) to service_role;
commit;
