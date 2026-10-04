begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-avatars', 'team-avatars', false, 65536, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 65536,
  allowed_mime_types = array['image/webp'];

create table public.team_avatars (
  event_id uuid not null,
  team_number integer not null,
  storage_path text not null unique,
  source text not null default 'tba' check (source = 'tba'),
  provider_key text,
  updated_at timestamptz not null default now(),
  primary key (event_id, team_number),
  foreign key (event_id, team_number) references public.event_teams(event_id, team_number),
  constraint team_avatar_path_check check (
    storage_path ~ '^[0-9a-f-]{36}/[0-9]+/[0-9a-f]{64}[.]webp$'
  )
);

alter table public.team_avatars enable row level security;
revoke all on public.team_avatars from public, anon, authenticated;
grant select on public.team_avatars to authenticated;
grant all on public.team_avatars to service_role;
create policy team_avatar_read on public.team_avatars for select to authenticated
  using (private.can_read_event(event_id));

create policy team_avatar_object_read on storage.objects for select to authenticated
  using (bucket_id = 'team-avatars' and exists (
    select 1 from public.team_avatars avatar
    where avatar.storage_path = name and private.can_read_event(avatar.event_id)
  ));

commit;
