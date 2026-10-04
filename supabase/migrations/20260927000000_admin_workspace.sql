begin;
lock table public.profiles in share row exclusive mode;

-- A locked counter makes concurrent removal of the last two admins safe.
-- Counting profiles inside a row trigger alone would permit write skew.
create table private.admin_guard (
 singleton boolean primary key default true check(singleton),
 active_admins integer not null check(active_admins >= 0)
);
insert into private.admin_guard(singleton,active_admins)
select true,count(*) from public.profiles where active and role='admin';
revoke all on private.admin_guard from public,anon,authenticated,service_role;

create function private.protect_last_admin() returns trigger
language plpgsql security definer set search_path='' as $$
declare was_admin boolean := false; is_admin boolean := false;
begin
 if TG_OP <> 'INSERT' then was_admin := old.active and old.role='admin'; end if;
 if TG_OP <> 'DELETE' then is_admin := new.active and new.role='admin'; end if;
 if was_admin and not is_admin then
  update private.admin_guard set active_admins=active_admins-1 where singleton and active_admins>1;
  if not found then raise exception 'last_active_admin' using errcode='23514'; end if;
 elsif is_admin and not was_admin then
  update private.admin_guard set active_admins=active_admins+1 where singleton;
 end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end $$;
create trigger protect_last_admin after insert or update or delete on public.profiles
for each row execute function private.protect_last_admin();
revoke all on function private.protect_last_admin() from public,anon,authenticated,service_role;

-- Admins need to see inactive profiles in the account list, too.
create policy profiles_admin_read on public.profiles for select to authenticated
using (private.has_role('admin'));

create table public.admin_account_audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null references public.profiles(id),
 target_id uuid not null references public.profiles(id),
 before_values jsonb not null,
 after_values jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.admin_account_audit enable row level security;
revoke all on public.admin_account_audit from public,anon,authenticated;
grant select on public.admin_account_audit to authenticated;
create policy admin_audit_read on public.admin_account_audit for select to authenticated using(private.has_role('admin'));

-- Only the server service-role can invoke this; actor is obtained from getUser,
-- never trusted from browser form data. Recheck actor under lock in the DB.
create function public.admin_save_profile(actor_id uuid, target_id uuid, changes jsonb, expected jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles; before_value jsonb; after_value jsonb;
begin
 perform 1 from public.profiles where id=actor_id and active and role='admin' for share;
 if not found then raise exception 'admin_required' using errcode='42501'; end if;
 select * into p from public.profiles where id=target_id for update;
 if not found then raise exception 'profile_not_found' using errcode='P0002'; end if;
 before_value := jsonb_build_object('username',p.username,'display_name',p.display_name,'role',p.role,'active',p.active);
 if before_value is distinct from expected then raise exception 'profile_changed' using errcode='40001'; end if;
 if jsonb_typeof(changes->'active') is distinct from 'boolean'
 or nullif(btrim(changes->>'display_name'),'') is null
 or jsonb_typeof(changes->'username') is distinct from 'string'
 or (changes->>'role') is null then raise exception 'invalid_profile' using errcode='23514'; end if;
 update public.profiles set username=changes->>'username',display_name=btrim(changes->>'display_name'),
 role=(changes->>'role')::public.profile_role, active=(changes->>'active')::boolean where id=target_id;
 select jsonb_build_object('username',username,'display_name',display_name,'role',role,'active',active)
 into after_value from public.profiles where id=target_id;
 if before_value is distinct from after_value then
  insert into public.admin_account_audit(actor_id,target_id,before_values,after_values)
  values(actor_id,target_id,before_value,after_value);
 end if;
end $$;
revoke all on function public.admin_save_profile(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.admin_save_profile(uuid,uuid,jsonb,jsonb) to service_role;

-- Preserve the original no-client-profile-write boundary explicitly.
revoke insert,update,delete on public.profiles from anon,authenticated;
-- Archives are the normal lifecycle. No authenticated hard delete, even admins.
revoke delete on public.events from authenticated;
commit;
