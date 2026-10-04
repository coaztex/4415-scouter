begin;

create type public.review_resolution as enum (
  'open', 'reviewed_no_change', 'video_review_requested', 'corrected'
);
create type public.correction_provenance as enum ('live', 'manual_correction', 'video_rescout');
create type public.sync_conflict_kind as enum ('sync_conflict', 'duplicate_candidate', 'client_id_collision');

alter table public.match_scouting_submissions
  add column corrected_by uuid references public.profiles(id),
  add column correction_provenance public.correction_provenance not null default 'live';
alter table public.pit_scouting_submissions
  add column corrected_by uuid references public.profiles(id),
  add column correction_provenance public.correction_provenance not null default 'live';

-- Append-only snapshots contain every superseded canonical version. The live
-- submission row remains the canonical version used by analytics.
create table public.scouting_submission_revisions (
 id bigint generated always as identity primary key,
 event_id uuid not null references public.events(id),
 submission_kind text not null check (submission_kind in ('match','pit')),
 match_submission_id uuid references public.match_scouting_submissions(id),
 pit_submission_id uuid references public.pit_scouting_submissions(id),
 revision integer not null check (revision > 0),
 snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
 editor_user_id uuid not null references public.profiles(id),
 correction_reason text check (correction_reason is null or length(correction_reason) <= 1000),
 provenance public.correction_provenance not null,
 recorded_at timestamptz not null default now(),
 check ((submission_kind='match' and match_submission_id is not null and pit_submission_id is null)
     or (submission_kind='pit' and pit_submission_id is not null and match_submission_id is null)),
 unique(match_submission_id,revision), unique(pit_submission_id,revision)
);
create index scouting_revisions_event_idx on public.scouting_submission_revisions(event_id,recorded_at desc);

create table public.scouting_submission_reviews (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id),
 submission_kind text not null check (submission_kind in ('match','pit')),
 match_submission_id uuid references public.match_scouting_submissions(id),
 pit_submission_id uuid references public.pit_scouting_submissions(id),
 resolution public.review_resolution not null default 'open',
 flag_reason text not null check (length(btrim(flag_reason)) between 1 and 1000),
 opened_by uuid not null references public.profiles(id),
 resolved_by uuid references public.profiles(id),
 opened_at timestamptz not null default now(),
 resolved_at timestamptz,
 updated_at timestamptz not null default now(),
 check ((submission_kind='match' and match_submission_id is not null and pit_submission_id is null)
     or (submission_kind='pit' and pit_submission_id is not null and match_submission_id is null)),
 check ((resolution='open' and resolved_at is null and resolved_by is null)
     or (resolution<>'open' and resolved_at is not null and resolved_by is not null)),
 unique(match_submission_id), unique(pit_submission_id)
);
create index scouting_reviews_event_resolution_idx on public.scouting_submission_reviews(event_id,resolution,updated_at desc);

create table public.scouting_sync_conflicts (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id),
 actor_user_id uuid not null references public.profiles(id),
 submission_kind text not null check (submission_kind in ('match','pit')),
 client_submission_id uuid not null,
 assignment_id uuid references public.scouting_assignments(id),
 match_id uuid references public.matches(id),
 team_number integer not null check (team_number > 0),
 kind public.sync_conflict_kind not null,
 attempted_payload jsonb not null check (jsonb_typeof(attempted_payload)='object'),
 status public.review_resolution not null default 'open',
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 check ((status='open' and reviewed_by is null and reviewed_at is null)
     or (status<>'open' and reviewed_by is not null and reviewed_at is not null))
);
create index scouting_sync_conflicts_queue_idx on public.scouting_sync_conflicts(event_id,status,created_at desc);
create unique index scouting_sync_conflicts_retry_unique
  on public.scouting_sync_conflicts(event_id,client_submission_id,md5(attempted_payload::text)) where status='open';

alter table public.scouting_submission_revisions enable row level security;
alter table public.scouting_submission_reviews enable row level security;
alter table public.scouting_sync_conflicts enable row level security;
revoke all on public.scouting_submission_revisions, public.scouting_submission_reviews, public.scouting_sync_conflicts from public,anon,authenticated;
grant select on public.scouting_submission_revisions, public.scouting_submission_reviews, public.scouting_sync_conflicts to authenticated;
grant all on public.scouting_submission_revisions, public.scouting_submission_reviews, public.scouting_sync_conflicts to service_role;
create policy strategy_read_revisions on public.scouting_submission_revisions for select to authenticated
 using (private.can_read_event(event_id) and private.has_role('strategy'));
create policy strategy_read_reviews on public.scouting_submission_reviews for select to authenticated
 using (private.can_read_event(event_id) and private.has_role('strategy'));
create policy strategy_read_conflicts on public.scouting_sync_conflicts for select to authenticated
 using (private.can_read_event(event_id) and private.has_role('strategy'));

create function public.review_scouting_submission(
 actor uuid, target_kind text, target_submission uuid,
 next_resolution public.review_resolution, reason text
) returns void language plpgsql security definer set search_path='' as $$
declare person public.profiles; eid uuid; existing public.scouting_submission_reviews;
begin
 select * into person from public.profiles where id=actor and active and role in ('strategy','admin') for share;
 if not found then raise exception 'Strategy or admin required' using errcode='42501'; end if;
 if nullif(btrim(reason),'') is null or length(reason)>1000 or next_resolution not in ('open','reviewed_no_change','video_review_requested') then
  raise exception 'Invalid review update' using errcode='23514'; end if;
 if target_kind='match' then select event_id into eid from public.match_scouting_submissions where id=target_submission and status='final';
 elsif target_kind='pit' then select event_id into eid from public.pit_scouting_submissions where id=target_submission and status='final';
 else raise exception 'Invalid submission kind' using errcode='23514'; end if;
 if eid is null then raise exception 'Final submission missing' using errcode='23514'; end if;
 select * into existing from public.scouting_submission_reviews
  where (scouting_submission_reviews.submission_kind='match' and match_submission_id=target_submission)
     or (scouting_submission_reviews.submission_kind='pit' and pit_submission_id=target_submission) for update;
 if found then
  update public.scouting_submission_reviews set resolution=next_resolution,flag_reason=btrim(reason),
   resolved_by=case when next_resolution='open' then null else actor end,
   resolved_at=case when next_resolution='open' then null else now() end,updated_at=now() where id=existing.id;
 else
  insert into public.scouting_submission_reviews(event_id,submission_kind,match_submission_id,pit_submission_id,resolution,flag_reason,opened_by,resolved_by,resolved_at)
  values(eid,target_kind,case when target_kind='match' then target_submission end,
   case when target_kind='pit' then target_submission end,next_resolution,btrim(reason),actor,
   case when next_resolution='open' then null else actor end,case when next_resolution='open' then null else now() end);
 end if;
end $$;

create function public.correct_scouting_submission(
 actor uuid, target_kind text, target_submission uuid, expected_revision integer,
 payload jsonb, target_schema_version integer, reason text, provenance public.correction_provenance
) returns integer language plpgsql security definer set search_path='' as $$
declare person public.profiles; old_match public.match_scouting_submissions; old_pit public.pit_scouting_submissions; next_revision integer;
begin
 select * into person from public.profiles where id=actor and active and role in ('strategy','admin') for share;
 if not found then raise exception 'Strategy or admin required' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or target_schema_version<1 or provenance not in ('manual_correction','video_rescout')
    or reason is not null and length(reason)>1000 then raise exception 'Invalid correction' using errcode='23514'; end if;
 perform set_config('app.correction_actor',actor::text,true);
 if target_kind='match' then
  select * into old_match from public.match_scouting_submissions where id=target_submission and status='final' for update;
  if not found or old_match.revision<>expected_revision then raise exception 'Submission changed' using errcode='40001'; end if;
  if old_match.game_data=payload then raise exception 'Correction did not change the payload' using errcode='23514'; end if;
  insert into public.scouting_submission_revisions(event_id,submission_kind,match_submission_id,revision,snapshot,editor_user_id,correction_reason,provenance)
   values(old_match.event_id,'match',old_match.id,old_match.revision,to_jsonb(old_match),actor,nullif(btrim(reason),''),provenance);
  update public.match_scouting_submissions set game_data=payload,schema_version=target_schema_version,issues=coalesce(payload->'issues','[]'),
   note=payload#>>'{post_match,important_note}',correction_reason=nullif(btrim(reason),''),corrected_by=actor,correction_provenance=provenance
   where id=target_submission returning revision into next_revision;
  insert into public.scouting_submission_reviews(event_id,submission_kind,match_submission_id,resolution,flag_reason,opened_by,resolved_by,resolved_at)
   values(old_match.event_id,'match',old_match.id,'corrected',coalesce(nullif(btrim(reason),''),'Corrected submission'),actor,actor,now())
   on conflict(match_submission_id) do update set resolution='corrected',flag_reason=excluded.flag_reason,resolved_by=actor,resolved_at=now(),updated_at=now();
 elsif target_kind='pit' then
  select * into old_pit from public.pit_scouting_submissions where id=target_submission and status='final' for update;
  if not found or old_pit.revision<>expected_revision then raise exception 'Submission changed' using errcode='40001'; end if;
  if old_pit.game_data=payload then raise exception 'Correction did not change the payload' using errcode='23514'; end if;
  insert into public.scouting_submission_revisions(event_id,submission_kind,pit_submission_id,revision,snapshot,editor_user_id,correction_reason,provenance)
   values(old_pit.event_id,'pit',old_pit.id,old_pit.revision,to_jsonb(old_pit),actor,nullif(btrim(reason),''),provenance);
  update public.pit_scouting_submissions set game_data=payload,schema_version=target_schema_version,correction_reason=nullif(btrim(reason),''),corrected_by=actor,correction_provenance=provenance
   where id=target_submission returning revision into next_revision;
  insert into public.scouting_submission_reviews(event_id,submission_kind,pit_submission_id,resolution,flag_reason,opened_by,resolved_by,resolved_at)
   values(old_pit.event_id,'pit',old_pit.id,'corrected',coalesce(nullif(btrim(reason),''),'Corrected submission'),actor,actor,now())
   on conflict(pit_submission_id) do update set resolution='corrected',flag_reason=excluded.flag_reason,resolved_by=actor,resolved_at=now(),updated_at=now();
 else raise exception 'Invalid submission kind' using errcode='23514'; end if;
 return next_revision;
end $$;

create function public.resolve_sync_conflict(
 actor uuid, target uuid, next_resolution public.review_resolution
) returns void language plpgsql security definer set search_path='' as $$
declare person public.profiles;
begin
 select * into person from public.profiles where id=actor and active and role in ('strategy','admin') for share;
 if not found then raise exception 'Strategy or admin required' using errcode='42501'; end if;
 if next_resolution not in ('reviewed_no_change','video_review_requested') then
  raise exception 'Invalid conflict resolution' using errcode='23514'; end if;
 update public.scouting_sync_conflicts set status=next_resolution,reviewed_by=actor,reviewed_at=now()
  where id=target and status='open';
 if not found then raise exception 'Open conflict missing' using errcode='40001'; end if;
end $$;

-- Only the narrow correction RPC may update a final record. It sets the actor
-- marker after independently checking an active strategy/admin profile.
create or replace function private.guard_submission()
returns trigger language plpgsql set search_path='' as $$
declare correction_actor text;
begin
 if TG_OP='INSERT' then new.revision:=1; new.correction_reason:=null;
 else
  if new.id<>old.id or new.client_submission_id<>old.client_submission_id or new.event_id<>old.event_id
     or new.team_number<>old.team_number or new.scout_user_id<>old.scout_user_id or new.game_slug<>old.game_slug then
   raise exception 'Submission identity is immutable' using errcode='23514'; end if;
  if TG_TABLE_NAME='match_scouting_submissions' and (new.match_id<>old.match_id or new.assignment_id is distinct from old.assignment_id) then
   raise exception 'Submission match/assignment is immutable' using errcode='23514'; end if;
  if (to_jsonb(new)-array['updated_at','created_at','revision'])=(to_jsonb(old)-array['updated_at','created_at','revision']) then return old; end if;
  if old.status='final' then
   correction_actor:=current_setting('app.correction_actor',true);
   if correction_actor is null or correction_actor='' or new.corrected_by::text<>correction_actor or new.status<>'final' then
    raise exception 'Final submissions require the correction workflow' using errcode='42501'; end if;
  else new.correction_reason:=null; new.corrected_by:=null; new.correction_provenance:='live'; end if;
  new.revision:=old.revision+1; new.created_at:=old.created_at; new.updated_at:=clock_timestamp();
 end if; return new;
end $$;

revoke all on function public.review_scouting_submission(uuid,text,uuid,public.review_resolution,text) from public,anon,authenticated;
revoke all on function public.correct_scouting_submission(uuid,text,uuid,integer,jsonb,integer,text,public.correction_provenance) from public,anon,authenticated;
revoke all on function public.resolve_sync_conflict(uuid,uuid,public.review_resolution) from public,anon,authenticated;
grant execute on function public.review_scouting_submission(uuid,text,uuid,public.review_resolution,text) to service_role;
grant execute on function public.correct_scouting_submission(uuid,text,uuid,integer,jsonb,integer,text,public.correction_provenance) to service_role;
grant execute on function public.resolve_sync_conflict(uuid,uuid,public.review_resolution) to service_role;

commit;
