begin;

-- Postgres Changes cannot safely filter RLS-protected DELETE rows by event_id.
-- Touch one event row per DELETE statement; existing event-scoped subscribers refresh.
create function private.signal_assignment_deletions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.events set updated_at = clock_timestamp()
  where id in (select distinct event_id from deleted_assignments);
  return null;
end $$;
create trigger signal_assignment_deletions
after delete on public.scouting_assignments
referencing old table as deleted_assignments
for each statement execute function private.signal_assignment_deletions();
revoke all on function private.signal_assignment_deletions() from public, anon, authenticated;

commit;
