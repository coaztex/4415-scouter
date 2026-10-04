begin;

-- Inactive remains the single authorization gate for both pending accounts
-- and accounts that must replace an administrator-issued password.
alter table public.profiles add column must_change_password boolean not null default false;
alter table public.profiles add constraint profiles_change_inactive check (not (active and must_change_password));
grant select (must_change_password) on public.profiles to authenticated;

create table public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','resolved','dismissed')),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  constraint reset_resolution_consistent check ((status='pending' and resolved_at is null and resolved_by is null) or (status<>'pending' and resolved_at is not null and resolved_by is not null))
);
create unique index one_pending_reset_per_user on public.password_reset_requests(user_id) where status='pending';
create index password_resets_pending_order on public.password_reset_requests(requested_at desc) where status='pending';
alter table public.password_reset_requests enable row level security;
revoke all on public.password_reset_requests from public,anon,authenticated;
grant select on public.password_reset_requests to authenticated;
create policy password_reset_requests_admin_read on public.password_reset_requests
for select to authenticated using (private.has_role('admin'));
grant all on public.password_reset_requests to service_role;

-- Always returns void. Neither unknown identifiers nor existing pending requests
-- are observable through this service-only operation.
create function public.submit_password_reset_request(identifier text)
returns void language plpgsql security definer set search_path='' as $$
declare target_id uuid; normalized text := lower(btrim(identifier));
begin
  if normalized is null or char_length(normalized)>254 then return; end if;
  select p.id into target_id from public.profiles p join auth.users u on u.id=p.id
  where (p.username=normalized or lower(u.email)=normalized)
    and (p.active or p.approval_pending or p.must_change_password)
  limit 1;
  if target_id is not null then
    insert into public.password_reset_requests(user_id) values(target_id)
    on conflict (user_id) where status='pending' do nothing;
  end if;
end $$;
revoke all on function public.submit_password_reset_request(text) from public,anon,authenticated;
grant execute on function public.submit_password_reset_request(text) to service_role;

-- Stage access blocking before the external Auth password update. If Auth
-- fails, the pending request remains retryable and the old password can still
-- be used to finish the required change.
create function public.begin_admin_password_reset(actor_id uuid, request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.password_reset_requests; p public.profiles;
begin
  perform 1 from public.profiles where id=actor_id and active and role='admin' for share;
  if not found then raise exception 'admin_required' using errcode='42501'; end if;
  select * into r from public.password_reset_requests where id=request_id and status='pending' for update;
  if not found then raise exception 'request_changed' using errcode='40001'; end if;
  select * into p from public.profiles where id=r.user_id for update;
  if not (p.active or p.approval_pending or p.must_change_password) then
    raise exception 'account_disabled' using errcode='23514';
  end if;
  update public.profiles set active=false,must_change_password=true where id=p.id;
  return p.id;
end $$;
revoke all on function public.begin_admin_password_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_admin_password_reset(uuid,uuid) to service_role;

create function public.finish_admin_password_reset(actor_id uuid, request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.profiles where id=actor_id and active and role='admin' for share;
  if not found then raise exception 'admin_required' using errcode='42501'; end if;
  update public.password_reset_requests set status='resolved',resolved_at=now(),resolved_by=actor_id
  where id=request_id and status='pending'
    and exists(select 1 from public.profiles where id=user_id and must_change_password);
  if not found then raise exception 'request_changed' using errcode='40001'; end if;
end $$;
revoke all on function public.finish_admin_password_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finish_admin_password_reset(uuid,uuid) to service_role;

create function public.dismiss_admin_password_reset(actor_id uuid, request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.profiles where id=actor_id and active and role='admin' for share;
  if not found then raise exception 'admin_required' using errcode='42501'; end if;
  update public.password_reset_requests set status='dismissed',resolved_at=now(),resolved_by=actor_id
  where id=request_id and status='pending';
  if not found then raise exception 'request_changed' using errcode='40001'; end if;
end $$;
revoke all on function public.dismiss_admin_password_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function public.dismiss_admin_password_reset(uuid,uuid) to service_role;

create function public.complete_required_password_change(actor_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.profiles set active=true,must_change_password=false
  where id=actor_id and not active and not approval_pending and must_change_password;
  if not found then raise exception 'password_change_not_allowed' using errcode='42501'; end if;
end $$;
revoke all on function public.complete_required_password_change(uuid) from public,anon,authenticated;
grant execute on function public.complete_required_password_change(uuid) to service_role;

-- Existing audited admin edits preserve the reset flag. Approving a pending
-- account with a temporary password clears pending, then requires the change.
create or replace function public.admin_save_profile(actor_id uuid, target_id uuid, changes jsonb, expected jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles; before_value jsonb; after_value jsonb; comparison jsonb;
begin
 perform 1 from public.profiles where id=actor_id and active and role='admin' for share;
 if not found then raise exception 'admin_required' using errcode='42501'; end if;
 select * into p from public.profiles where id=target_id for update;
 if not found then raise exception 'profile_not_found' using errcode='P0002'; end if;
 before_value := jsonb_build_object('username',p.username,'display_name',p.display_name,'role',p.role,'active',p.active,'approval_pending',p.approval_pending,'must_change_password',p.must_change_password);
 comparison := before_value;
 if not expected ? 'approval_pending' then comparison := comparison - 'approval_pending'; end if;
 if not expected ? 'must_change_password' then comparison := comparison - 'must_change_password'; end if;
 if comparison is distinct from expected then raise exception 'profile_changed' using errcode='40001'; end if;
 if jsonb_typeof(changes->'active') is distinct from 'boolean'
 or nullif(btrim(changes->>'display_name'),'') is null
 or jsonb_typeof(changes->'username') is distinct from 'string'
 or (changes->>'role') is null
 or (changes ? 'approval_pending' and jsonb_typeof(changes->'approval_pending') is distinct from 'boolean')
 then raise exception 'invalid_profile' using errcode='23514'; end if;
 update public.profiles set username=changes->>'username',display_name=btrim(changes->>'display_name'),
 role=(changes->>'role')::public.profile_role,
 active=(changes->>'active')::boolean and not p.must_change_password,
 approval_pending=case when (changes->>'active')::boolean then false
   when changes ? 'approval_pending' then (changes->>'approval_pending')::boolean else p.approval_pending end,
 must_change_password=case when not (changes->>'active')::boolean and not coalesce((changes->>'approval_pending')::boolean,p.approval_pending)
   then false else p.must_change_password end
 where id=target_id;
 select jsonb_build_object('username',username,'display_name',display_name,'role',role,'active',active,'approval_pending',approval_pending,'must_change_password',must_change_password)
 into after_value from public.profiles where id=target_id;
 if before_value is distinct from after_value then
  insert into public.admin_account_audit(actor_id,target_id,before_values,after_values)
  values(actor_id,target_id,before_value,after_value);
 end if;
end $$;

commit;
