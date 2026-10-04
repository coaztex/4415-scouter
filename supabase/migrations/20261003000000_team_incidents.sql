begin;

-- Match submissions remain the immutable scout evidence. This table is a small
-- projection for review, with a separate, once-only confirmation field.
create type public.incident_status as enum ('normal','minor_issue','major_issue','DNF','DNS');
create type public.incident_issue as enum ('disabled','communications','drivetrain','intake','shooter_scorer','tipped','other');
create type public.incident_cause_source as enum ('unconfirmed','team_confirmed','strategy_confirmed','other');

create table public.team_incidents (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null,
 match_id uuid not null,
 team_number integer not null,
 created_from_submission_id uuid not null references public.match_scouting_submissions(id),
 observation_key text not null,
 source_issue_id uuid,
 observed_status public.incident_status not null,
 observed_issue public.incident_issue,
 observed_phase text check (observed_phase in ('auto','teleop')),
 observed_at_seconds numeric check (observed_at_seconds between 0 and 600),
 observed_note text check (length(observed_note) <= 500),
 recovered text not null default 'unknown' check (recovered in ('yes','no','unknown')),
 confirmed_cause text check (length(btrim(confirmed_cause)) between 1 and 500),
 cause_source public.incident_cause_source not null default 'unconfirmed',
 cause_evidence text check (length(btrim(cause_evidence)) between 1 and 1000),
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (match_id,event_id,team_number) references public.match_teams(match_id,event_id,team_number),
 unique (created_from_submission_id,observation_key),
 check ((observation_key = 'status' and source_issue_id is null) or
        (source_issue_id is not null and observation_key = 'issue:' || source_issue_id::text)),
 check ((confirmed_cause is null and cause_source = 'unconfirmed' and cause_evidence is null and reviewed_by is null and reviewed_at is null)
     or (confirmed_cause is not null and cause_source <> 'unconfirmed' and cause_evidence is not null and reviewed_by is not null and reviewed_at is not null))
);
create index team_incidents_event_team_match_idx on public.team_incidents(event_id,team_number,match_id);
create index team_incidents_event_unreviewed_idx on public.team_incidents(event_id,created_at) where reviewed_at is null;
create index team_incidents_match_idx on public.team_incidents(match_id);

alter table public.team_incidents enable row level security;
revoke all on public.team_incidents from public,anon,authenticated;
grant select on public.team_incidents to authenticated;
grant all on public.team_incidents to service_role;
create policy incident_read on public.team_incidents for select to authenticated using (
 private.can_read_event(event_id) and
 (private.has_role('strategy') or exists (
   select 1 from public.match_scouting_submissions s
   where s.id = created_from_submission_id and s.scout_user_id = (select auth.uid())
 ))
);

create function private.protect_incident_observation() returns trigger
language plpgsql set search_path = '' as $$
begin
 if (to_jsonb(new) - array['confirmed_cause','cause_source','cause_evidence','reviewed_by','reviewed_at','updated_at'])
    is distinct from
    (to_jsonb(old) - array['confirmed_cause','cause_source','cause_evidence','reviewed_by','reviewed_at','updated_at']) then
  raise exception 'Scout observation snapshot is immutable' using errcode='23514';
 end if;
 if old.reviewed_at is not null and
    (new.confirmed_cause,new.cause_source,new.cause_evidence,new.reviewed_by,new.reviewed_at)
    is distinct from
    (old.confirmed_cause,old.cause_source,old.cause_evidence,old.reviewed_by,old.reviewed_at) then
  raise exception 'Confirmed cause is immutable; use a deliberate correction workflow' using errcode='23514';
 end if;
 new.updated_at := clock_timestamp();
 return new;
end $$;
create trigger protect_incident_observation before update on public.team_incidents
 for each row execute function private.protect_incident_observation();
revoke all on function private.protect_incident_observation() from public,anon,authenticated,service_role;

create function private.project_match_incidents(submission_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.match_scouting_submissions; issue jsonb; issue_count integer := 0;
begin
 select * into s from public.match_scouting_submissions where id = submission_id;
 if not found or s.status <> 'final' or s.game_slug <> '2026-rebuilt' or s.schema_version <> 2 then return; end if;
 for issue in select value from jsonb_array_elements(coalesce(s.game_data->'issues','[]'::jsonb)) loop
  insert into public.team_incidents(
   event_id,match_id,team_number,created_from_submission_id,observation_key,source_issue_id,
   observed_status,observed_issue,observed_phase,observed_at_seconds,observed_note,recovered
  ) values (
   s.event_id,s.match_id,s.team_number,s.id,'issue:' || (issue->>'id'),(issue->>'id')::uuid,
   (s.game_data#>>'{post_match,reliability}')::public.incident_status,
   (issue#>>'{observed,category}')::public.incident_issue,
   issue->>'phase',(issue->>'at_seconds')::numeric,issue#>>'{observed,description}',
   coalesce(issue->>'recovered','unknown')
  ) on conflict (created_from_submission_id,observation_key) do nothing;
  issue_count := issue_count + 1;
 end loop;
 if issue_count = 0 and (s.game_data#>>'{post_match,reliability}') <> 'normal' then
  insert into public.team_incidents(
   event_id,match_id,team_number,created_from_submission_id,observation_key,
   observed_status,observed_note,recovered
  ) values (
   s.event_id,s.match_id,s.team_number,s.id,'status',
   (s.game_data#>>'{post_match,reliability}')::public.incident_status,
   s.game_data#>>'{post_match,important_note}',
   coalesce(s.game_data#>>'{post_match,recovered}','unknown')
  ) on conflict (created_from_submission_id,observation_key) do nothing;
 end if;
end $$;
revoke all on function private.project_match_incidents(uuid) from public,anon,authenticated,service_role;

create function private.project_new_match_incidents() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 perform private.project_match_incidents(new.id);
 return new;
end $$;
create trigger project_new_match_incidents after insert or update of status on public.match_scouting_submissions
 for each row execute function private.project_new_match_incidents();
revoke all on function private.project_new_match_incidents() from public,anon,authenticated,service_role;

-- Existing accepted records gain review entries without modifying submissions.
do $$ declare row_id uuid; begin
 for row_id in select id from public.match_scouting_submissions
   where status='final' and game_slug='2026-rebuilt' and schema_version=2 loop
  perform private.project_match_incidents(row_id);
 end loop;
end $$;

create function public.confirm_team_incident(
 actor uuid, target uuid, cause text, source public.incident_cause_source, evidence text
) returns void language plpgsql security definer set search_path = '' as $$
declare p public.profiles; incident public.team_incidents; event_status public.event_status;
begin
 select * into p from public.profiles where id=actor and active and role in ('strategy','admin') for share;
 if not found then raise exception 'Strategy or admin account required' using errcode='42501'; end if;
 select * into incident from public.team_incidents where id=target for update;
 if not found then raise exception 'Incident unavailable' using errcode='02000'; end if;
 select status into event_status from public.events where id=incident.event_id;
 if event_status <> 'active' and p.role <> 'admin' then raise exception 'Archived event requires admin' using errcode='42501'; end if;
 if incident.reviewed_at is not null then raise exception 'Incident already confirmed' using errcode='23514'; end if;
 if source is null or source='unconfirmed' or nullif(btrim(cause),'') is null or length(btrim(cause))>500
    or nullif(btrim(evidence),'') is null or length(btrim(evidence))>1000 then
  raise exception 'Cause and evidence source are required' using errcode='23514';
 end if;
 update public.team_incidents set confirmed_cause=btrim(cause),cause_source=source,
  cause_evidence=btrim(evidence),reviewed_by=actor,reviewed_at=clock_timestamp()
  where id=target;
end $$;
revoke all on function public.confirm_team_incident(uuid,uuid,text,public.incident_cause_source,text) from public,anon,authenticated;
grant execute on function public.confirm_team_incident(uuid,uuid,text,public.incident_cause_source,text) to service_role;

commit;
