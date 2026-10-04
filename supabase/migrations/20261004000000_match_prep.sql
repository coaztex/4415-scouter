begin;

alter table public.events add column our_team_number integer check (our_team_number > 0);

create table public.match_prep_notes (
 match_id uuid primary key,
 event_id uuid not null,
 note text not null check (length(btrim(note)) between 1 and 2000),
 updated_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (match_id, event_id) references public.matches(id, event_id)
);
create index match_prep_notes_event_idx on public.match_prep_notes(event_id);
create trigger touch_updated_at before update on public.match_prep_notes
 for each row execute function private.touch_updated_at();
alter table public.match_prep_notes enable row level security;
revoke all on public.match_prep_notes from public, anon, authenticated;
grant select, insert, update on public.match_prep_notes to authenticated;
grant all on public.match_prep_notes to service_role;
create policy match_prep_notes_read on public.match_prep_notes for select to authenticated
 using (private.can_read_event(event_id) and private.has_role('strategy'));
create policy match_prep_notes_insert on public.match_prep_notes for insert to authenticated
 with check (private.can_scout_event(event_id) and private.has_role('strategy') and updated_by = (select auth.uid()));
create policy match_prep_notes_update on public.match_prep_notes for update to authenticated
 using (private.can_scout_event(event_id) and private.has_role('strategy'))
 with check (private.can_scout_event(event_id) and private.has_role('strategy') and updated_by = (select auth.uid()));

commit;
