begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('robot-media', 'robot-media', false, 2097152, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg'];

create table public.robot_media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  team_number integer not null,
  storage_path text,
  external_url text,
  media_type text not null default 'robot_photo' check (media_type = 'robot_photo'),
  uploaded_by uuid references public.profiles(id),
  source text not null check (source in ('pit_upload', 'tba')),
  created_at timestamptz not null default now(),
  is_primary boolean not null default false,
  foreign key (event_id, team_number) references public.event_teams(event_id, team_number),
  constraint robot_media_source_shape check (
    (source = 'pit_upload' and storage_path is not null and external_url is null and uploaded_by is not null)
    or (source = 'tba' and storage_path is null and external_url is not null and uploaded_by is null)
  ),
  constraint robot_media_path_check check (
    storage_path is null or storage_path ~ '^[0-9a-f-]{36}/[0-9]+/[0-9a-f-]{36}[.]jpg$'
  ),
  constraint robot_media_external_check check (
    external_url is null or external_url ~ '^https://i[.]imgur[.]com/[A-Za-z0-9]+[.](jpg|jpeg|png|webp)$'
  )
);
create unique index robot_media_storage_path_unique on public.robot_media(storage_path) where storage_path is not null;
create unique index robot_media_one_primary on public.robot_media(event_id, team_number) where is_primary;
create index robot_media_team_idx on public.robot_media(event_id, team_number, source, created_at desc);
create unique index robot_media_tba_url_unique on public.robot_media(event_id, team_number, external_url) where source = 'tba';

alter table public.robot_media enable row level security;
revoke all on public.robot_media from public, anon, authenticated;
grant select on public.robot_media to authenticated;
grant all on public.robot_media to service_role;
create policy robot_media_read on public.robot_media for select to authenticated
  using (private.can_read_event(event_id));

-- The application server owns uploads and deletions after verifying the caller.
-- No authenticated storage.objects write policy is granted for this bucket.
create policy robot_media_object_read on storage.objects for select to authenticated
  using (bucket_id = 'robot-media' and exists (
    select 1 from public.robot_media rm
    where rm.storage_path = name and private.can_read_event(rm.event_id)
  ));

commit;
