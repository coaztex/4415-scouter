begin;

create type public.event_status as enum ('active', 'archived');
create type public.pit_status as enum ('not_scouted', 'in_progress', 'completed', 'needs_review');
create type public.alliance_color as enum ('red', 'blue');
create type public.assignment_type as enum ('match', 'break');
create type public.assignment_status as enum ('assigned', 'in_progress', 'submitted', 'missed');
create type public.submission_status as enum ('draft', 'final');
create type public.external_source as enum ('tba', 'statbotics');
create type public.sync_status as enum ('idle', 'running', 'succeeded', 'failed');

create table public.events (
 id uuid primary key default gen_random_uuid(),
 tba_key text not null unique check (tba_key ~ '^[0-9]{4}[a-z0-9]+$'),
 year integer not null check (year between 1992 and 9999),
 name text not null check (length(btrim(name)) > 0),
 short_name text, event_type integer, city text, state text, country text,
 start_date date, end_date date,
 status public.event_status not null default 'active',
 game_slug text not null check (game_slug ~ '^[0-9]{4}-[a-z0-9]+(-[a-z0-9]+)*$'),
 last_tba_sync_at timestamptz, last_statbotics_sync_at timestamptz,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 source_metadata jsonb not null default '{}' check (jsonb_typeof(source_metadata) = 'object'),
 unique (id, game_slug),
 check (left(tba_key, 4) = year::text and left(game_slug, 4) = year::text),
 check (end_date is null or start_date is null or end_date >= start_date)
);
create index events_status_year_idx on public.events(status, year, start_date);
create index events_creator_idx on public.events(created_by);

create table public.teams (
 team_number integer primary key check (team_number > 0),
 tba_team_key text not null unique,
 nickname text, name text, city text, state text, country text,
 rookie_year integer check (rookie_year between 1992 and 9999), website text,
 source_metadata jsonb not null default '{}' check (jsonb_typeof(source_metadata) = 'object'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (tba_team_key = 'frc' || team_number::text)
);

create table public.event_teams (
 event_id uuid not null references public.events(id),
 team_number integer not null references public.teams(team_number),
 pit_status public.pit_status not null default 'not_scouted',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key (event_id, team_number)
);
create index event_teams_team_idx on public.event_teams(team_number, event_id);

create table public.matches (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id),
 tba_match_key text not null unique,
 comp_level text not null check (comp_level in ('qm', 'ef', 'qf', 'sf', 'f')),
 set_number integer not null check (set_number >= 1), match_number integer not null check (match_number >= 1),
 scheduled_time timestamptz, predicted_time timestamptz, actual_time timestamptz,
 winning_alliance public.alliance_color,
 result_metadata jsonb check (jsonb_typeof(result_metadata) = 'object'),
 raw_tba_payload jsonb check (jsonb_typeof(raw_tba_payload) = 'object'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (id, event_id), unique (event_id, comp_level, set_number, match_number)
);
create index matches_event_time_idx on public.matches(event_id, scheduled_time);

create table public.match_teams (
 match_id uuid not null, event_id uuid not null, team_number integer not null,
 alliance public.alliance_color not null, station smallint not null check (station between 1 and 3),
 surrogate boolean, dq boolean,
 primary key (match_id, team_number),
 unique (match_id, alliance, station), unique (match_id, event_id, team_number),
 foreign key (match_id, event_id) references public.matches(id, event_id),
 foreign key (event_id, team_number) references public.event_teams(event_id, team_number)
);
create index match_teams_event_team_idx on public.match_teams(event_id, team_number);

create table public.scouting_assignments (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id),
 match_id uuid, team_number integer,
 scout_user_id uuid not null references public.profiles(id),
 assignment_type public.assignment_type not null default 'match',
 status public.assignment_status not null default 'assigned',
 sequence integer not null check (sequence >= 0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((assignment_type = 'match' and match_id is not null and team_number is not null)
     or (assignment_type = 'break' and match_id is null and team_number is null)),
 foreign key (match_id, event_id, team_number) references public.match_teams(match_id, event_id, team_number),
 unique (id, event_id, match_id, team_number, scout_user_id),
 unique (event_id, scout_user_id, sequence)
);
create unique index assignments_match_team_unique on public.scouting_assignments(match_id, team_number) where assignment_type = 'match';
create unique index assignments_scout_match_unique on public.scouting_assignments(match_id, scout_user_id) where assignment_type = 'match';
create index assignments_scout_event_status_idx on public.scouting_assignments(scout_user_id, event_id, status, sequence);
create index assignments_event_idx on public.scouting_assignments(event_id, sequence);

create table public.match_scouting_submissions (
 id uuid primary key default gen_random_uuid(), client_submission_id uuid not null unique,
 event_id uuid not null, match_id uuid not null, team_number integer not null,
 assignment_id uuid, scout_user_id uuid not null references public.profiles(id),
 game_slug text not null, schema_version integer not null check (schema_version > 0),
 game_data jsonb not null check (jsonb_typeof(game_data) = 'object'),
 issues jsonb not null default '[]' check (jsonb_typeof(issues) = 'array'),
 note text, status public.submission_status not null default 'draft',
 started_at timestamptz not null default now(), completed_at timestamptz,
 revision integer not null default 1 check (revision > 0), correction_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (event_id, game_slug) references public.events(id, game_slug),
 foreign key (match_id, event_id, team_number) references public.match_teams(match_id, event_id, team_number),
 foreign key (assignment_id, event_id, match_id, team_number, scout_user_id)
   references public.scouting_assignments(id, event_id, match_id, team_number, scout_user_id),
 check (completed_at is null or completed_at >= started_at),
 check (status <> 'final' or completed_at is not null)
);
create unique index match_submission_assignment_final_unique on public.match_scouting_submissions(assignment_id) where status = 'final' and assignment_id is not null;
create unique index match_submission_scout_final_unique on public.match_scouting_submissions(event_id, match_id, team_number, scout_user_id) where status = 'final';
create index match_submissions_event_team_idx on public.match_scouting_submissions(event_id, team_number, status);
create index match_submissions_scout_idx on public.match_scouting_submissions(scout_user_id, event_id);
create index match_submissions_match_idx on public.match_scouting_submissions(match_id, event_id, team_number);
create index match_submissions_assignment_idx on public.match_scouting_submissions(assignment_id);

create table public.pit_scouting_submissions (
 id uuid primary key default gen_random_uuid(), client_submission_id uuid not null unique,
 event_id uuid not null, team_number integer not null,
 scout_user_id uuid not null references public.profiles(id),
 game_slug text not null, schema_version integer not null check (schema_version > 0),
 game_data jsonb not null check (jsonb_typeof(game_data) = 'object'), note text,
 status public.submission_status not null default 'draft',
 started_at timestamptz not null default now(), completed_at timestamptz,
 revision integer not null default 1 check (revision > 0), correction_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (event_id, team_number) references public.event_teams(event_id, team_number),
 foreign key (event_id, game_slug) references public.events(id, game_slug),
 check (completed_at is null or completed_at >= started_at),
 check (status <> 'final' or completed_at is not null)
);
create unique index pit_submission_final_unique on public.pit_scouting_submissions(event_id, team_number, scout_user_id) where status = 'final';
create index pit_submissions_event_team_idx on public.pit_scouting_submissions(event_id, team_number, status);
create index pit_submissions_scout_idx on public.pit_scouting_submissions(scout_user_id, event_id);

create table public.external_team_metrics (
 event_id uuid not null, team_number integer not null, source public.external_source not null,
 metric_version text not null, source_updated_at timestamptz, fetched_at timestamptz not null default now(),
 opr double precision, dpr double precision, ccwm double precision, epa_total double precision,
 payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
 primary key (event_id, team_number, source),
 foreign key (event_id, team_number) references public.event_teams(event_id, team_number)
);
create table public.event_rankings (
 event_id uuid not null, team_number integer not null, rank integer not null check (rank > 0),
 wins integer check (wins >= 0), losses integer check (losses >= 0), ties integer check (ties >= 0),
 ranking_score numeric, payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
 source_updated_at timestamptz, fetched_at timestamptz not null default now(),
 primary key (event_id, team_number),
 foreign key (event_id, team_number) references public.event_teams(event_id, team_number)
);
create index rankings_event_rank_idx on public.event_rankings(event_id, rank);

create table public.team_notes (
 id uuid primary key default gen_random_uuid(), event_id uuid not null, team_number integer not null,
 author_user_id uuid not null references public.profiles(id), note text not null check (length(btrim(note)) > 0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (event_id, team_number) references public.event_teams(event_id, team_number)
);
create index notes_event_team_idx on public.team_notes(event_id, team_number, created_at);
create index notes_author_idx on public.team_notes(author_user_id);

create table public.event_sync_state (
 event_id uuid not null references public.events(id), source public.external_source not null,
 last_attempt_at timestamptz, last_success_at timestamptz,
 status public.sync_status not null default 'idle', last_error text check (length(last_error) <= 500),
 primary key (event_id, source)
);

-- App roles are deliberately explicit rather than relying on enum sort order.
create function private.has_role(minimum public.profile_role)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.profiles where id = (select auth.uid()) and active and
  (role = 'admin' or role = minimum or (role = 'strategy' and minimum = 'scout')));
$$;
create function private.can_read_event(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select private.has_role('scout') and exists (
  select 1 from public.events where id = target and (status = 'active' or private.has_role('admin')));
$$;
create function private.can_scout_event(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select private.has_role('scout') and exists (select 1 from public.events where id = target and status = 'active');
$$;

create function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
 new.created_at := old.created_at;
 new.updated_at := clock_timestamp();
 return new;
end;
$$;

create function private.guard_submission()
returns trigger language plpgsql set search_path = '' as $$
begin
 if TG_OP = 'INSERT' then
  new.revision := 1;
  new.correction_reason := null;
 else
  if new.id <> old.id or new.client_submission_id <> old.client_submission_id
     or new.event_id <> old.event_id or new.team_number <> old.team_number
     or new.scout_user_id <> old.scout_user_id or new.game_slug <> old.game_slug then
   raise exception 'Submission identity is immutable' using errcode = '23514';
  end if;
  if TG_TABLE_NAME = 'match_scouting_submissions' then
   if new.match_id <> old.match_id or new.assignment_id is distinct from old.assignment_id then
    raise exception 'Submission match/assignment is immutable' using errcode = '23514';
   end if;
  end if;
  -- Exact replay is a no-op even for a final submission. Do not rewrite timestamps.
  if (to_jsonb(new) - array['updated_at','created_at','revision']) =
     (to_jsonb(old) - array['updated_at','created_at','revision']) then return old; end if;
  if old.status = 'final' then
   if not private.has_role('admin') then
    raise exception 'Final submissions require an admin correction' using errcode = '42501';
   end if;
   if new.status <> 'final' or nullif(btrim(new.correction_reason), '') is null then
    raise exception 'Final corrections must remain final and include a reason' using errcode = '23514';
   end if;
  else
   new.correction_reason := null;
  end if;
  new.revision := old.revision + 1;
  new.created_at := old.created_at;
  new.updated_at := clock_timestamp();
 end if;
 return new;
end;
$$;

-- Validate TBA key provenance without encoding season-specific game rules.
create function private.validate_match_key()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_key text;
begin
 select tba_key into event_key from public.events where id = new.event_id;
 if new.tba_match_key <> (event_key || '_' || new.comp_level ||
    case when new.comp_level = 'qm' then new.match_number::text else new.set_number::text || 'm' || new.match_number::text end) then
  raise exception 'Match key does not match its event/competition coordinates' using errcode = '23514';
 end if;
 return new;
end;
$$;
create trigger validate_match_key before insert or update on public.matches for each row execute function private.validate_match_key();

-- Table ownership/default grants vary across Supabase projects: reset explicitly.
do $$
declare t text;
begin
 foreach t in array array['events','teams','event_teams','matches','match_teams','scouting_assignments',
 'match_scouting_submissions','pit_scouting_submissions','external_team_metrics','event_rankings','team_notes','event_sync_state'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from public, anon, authenticated', t);
  execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  execute format('grant all on public.%I to service_role', t);
  execute format('create policy admin_manage on public.%I for all to authenticated using ((select private.has_role(''admin''))) with check ((select private.has_role(''admin'')))', t);
 end loop;
 foreach t in array array['events','teams','event_teams','matches','scouting_assignments','team_notes'] loop
  execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()', t);
 end loop;
 foreach t in array array['match_scouting_submissions','pit_scouting_submissions'] loop
  execute format('create trigger guard_submission before insert or update on public.%I for each row execute function private.guard_submission()', t);
 end loop;
end $$;

create policy events_read on public.events for select to authenticated using (private.can_read_event(id));
create policy teams_read on public.teams for select to authenticated using (
 (select private.has_role('scout')) and exists (select 1 from public.event_teams et where et.team_number = teams.team_number and private.can_read_event(et.event_id))
);
do $$
declare t text;
begin
 foreach t in array array['event_teams','matches','match_teams','external_team_metrics','event_rankings'] loop
  execute format('create policy event_read on public.%I for select to authenticated using (private.can_read_event(event_id))', t);
 end loop;
end $$;
create policy assignments_read on public.scouting_assignments for select to authenticated using (
 private.can_read_event(event_id) and (scout_user_id = (select auth.uid()) or (select private.has_role('strategy')))
);
-- Assignment status changes are managed by the future submission service/admin,
-- not by arbitrary client reassignment or status updates.
do $$
declare t text;
begin
 foreach t in array array['match_scouting_submissions','pit_scouting_submissions'] loop
  execute format('create policy submissions_read on public.%I for select to authenticated using (private.can_read_event(event_id) and (scout_user_id = (select auth.uid()) or (select private.has_role(''strategy''))))', t);
  execute format('create policy own_submission_insert on public.%I for insert to authenticated with check (private.can_scout_event(event_id) and scout_user_id = (select auth.uid()))', t);
  execute format('create policy own_submission_update on public.%I for update to authenticated using (private.can_scout_event(event_id) and scout_user_id = (select auth.uid())) with check (private.can_scout_event(event_id) and scout_user_id = (select auth.uid()))', t);
 end loop;
end $$;
create policy notes_read on public.team_notes for select to authenticated using (private.can_read_event(event_id));
create policy notes_insert on public.team_notes for insert to authenticated with check (private.can_scout_event(event_id) and author_user_id = (select auth.uid()));
create policy notes_update on public.team_notes for update to authenticated using (private.can_scout_event(event_id) and author_user_id = (select auth.uid())) with check (private.can_scout_event(event_id) and author_user_id = (select auth.uid()));
create policy notes_delete on public.team_notes for delete to authenticated using (private.can_scout_event(event_id) and author_user_id = (select auth.uid()));

-- Trigger functions need no direct API execute grants.
revoke all on function private.touch_updated_at(), private.guard_submission(), private.validate_match_key() from public, anon, authenticated;
revoke all on function private.has_role(public.profile_role), private.can_read_event(uuid), private.can_scout_event(uuid) from public, anon, authenticated;
grant execute on function private.has_role(public.profile_role), private.can_read_event(uuid), private.can_scout_event(uuid) to authenticated;

commit;
