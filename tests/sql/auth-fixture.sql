-- Only for fresh disposable vanilla PostgreSQL, never a Supabase project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema storage;
-- Disposable stand-in for Supabase's owned Realtime authorization surface.
create schema realtime;
create table realtime.messages (extension text, topic text);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true); $$;
grant usage on schema realtime to authenticated;
grant select,insert on realtime.messages to authenticated;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb, email text);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
 select coalesce(
   nullif(current_setting('request.jwt.claim.role', true), ''),
   nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
 );
$$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated;
insert into auth.users(id,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000001', '{}');
