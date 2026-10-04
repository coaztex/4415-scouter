begin;

-- Safe event-level invalidation. Raw scouting rows remain private under their
-- existing RLS policies; every event scout may re-read the coverage aggregate.
create table public.scouting_coverage_signal (
  event_id uuid primary key references public.events(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.scouting_coverage_signal enable row level security;
grant select on public.scouting_coverage_signal to authenticated;
grant all on public.scouting_coverage_signal to service_role;
create policy event_read on public.scouting_coverage_signal
for select to authenticated using (private.can_read_event(event_id));

create function private.signal_scouting_coverage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if tg_table_name = 'scouting_assignments' then
    if tg_op = 'INSERT' and new.status <> 'in_progress' then return new; end if;
    if tg_op = 'UPDATE' and new.status = old.status then return new; end if;
    if tg_op = 'DELETE' and old.status <> 'in_progress' then return old; end if;
  end if;
  target := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  insert into public.scouting_coverage_signal(event_id, updated_at)
  values (target, clock_timestamp())
  on conflict(event_id) do update set updated_at = excluded.updated_at;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger signal_match_scouting_coverage
after insert or update of status or delete on public.match_scouting_submissions
for each row execute function private.signal_scouting_coverage();
create trigger signal_assignment_coverage
after insert or update of status or delete on public.scouting_assignments
for each row execute function private.signal_scouting_coverage();
revoke all on function private.signal_scouting_coverage() from public, anon, authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='scouting_coverage_signal') then
    alter publication supabase_realtime add table public.scouting_coverage_signal;
  end if;
end $$;

commit;
