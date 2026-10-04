begin;

-- Supabase's default privileges granted broad access to this table despite
-- migration 20261012 only intending authenticated reads. RLS denied writes,
-- but explicit privileges should match the intended boundary too.
revoke all on public.scouting_coverage_signal from anon, authenticated;
grant select on public.scouting_coverage_signal to authenticated;

-- Capture now runs through service-only RPCs. These legacy RLS policies were
-- inert without table write grants, but keeping them invites privilege drift.
drop policy if exists own_submission_insert on public.match_scouting_submissions;
drop policy if exists own_submission_update on public.match_scouting_submissions;
drop policy if exists own_submission_insert on public.pit_scouting_submissions;
drop policy if exists own_submission_update on public.pit_scouting_submissions;

-- A pit row has no match_id/assignment_id. PostgreSQL does not guarantee
-- short-circuit evaluation for the previous combined condition.
create or replace function private.guard_submission()
returns trigger language plpgsql set search_path = '' as $$
declare correction_actor text;
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
  if (to_jsonb(new) - array['updated_at','created_at','revision']) =
     (to_jsonb(old) - array['updated_at','created_at','revision']) then return old; end if;
  if old.status = 'final' then
   correction_actor := current_setting('app.correction_actor', true);
   if correction_actor is null or correction_actor = ''
      or new.corrected_by::text <> correction_actor or new.status <> 'final' then
    raise exception 'Final submissions require the correction workflow' using errcode = '42501';
   end if;
  else
   new.correction_reason := null;
   new.corrected_by := null;
   new.correction_provenance := 'live';
  end if;
  new.revision := old.revision + 1;
  new.created_at := old.created_at;
  new.updated_at := clock_timestamp();
 end if;
 return new;
end $$;

commit;
