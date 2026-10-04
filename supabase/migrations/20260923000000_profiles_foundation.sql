begin;

create type public.profile_role as enum ('scout', 'strategy', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null default '' check (char_length(display_name) <= 100),
  role public.profile_role not null default 'scout',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,40}$')
);

-- This schema is not exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create function private.normalize_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.username := lower(btrim(new.username));
  if TG_OP = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
    new.updated_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger normalize_profile_before_write
before insert or update on public.profiles
for each row execute function private.normalize_profile();

create function private.create_auth_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Never trust raw_user_meta_data for role, activation, or username.
  -- UUID-based handles avoid signup collisions; admins may rename later.
  insert into public.profiles (id, username, display_name, role, active)
  values (new.id, 'scout_' || replace(new.id::text, '-', ''), '', 'scout', false);
  return new;
end;
$$;

create trigger create_profile_after_auth_user
after insert on auth.users
for each row execute function private.create_auth_profile();

-- Non-destructive backfill if Auth users predate this foundation.
insert into public.profiles (id, username)
select id, 'scout_' || replace(id::text, '-', '') from auth.users
on conflict (id) do nothing;

-- Narrow definer helper avoids recursive profiles RLS. Caller cannot supply
-- another user's ID. It reveals only their own activation state.
create function private.is_active_profile()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and active);
$$;

revoke all on function private.normalize_profile() from public, anon, authenticated;
revoke all on function private.create_auth_profile() from public, anon, authenticated;
revoke all on function private.is_active_profile() from public, anon, authenticated;
grant execute on function private.is_active_profile() to authenticated;

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select (id, username, display_name, role, active) on public.profiles to authenticated;
grant all on public.profiles to service_role;

create policy profiles_read_self_or_active_directory
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (active and (select private.is_active_profile()))
);

-- No client INSERT/UPDATE/DELETE privileges or policies, even for profile admins.
-- A future authorized server admin service must perform controlled writes.
commit;
