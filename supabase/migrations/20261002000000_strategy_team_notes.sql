begin;
drop policy notes_insert on public.team_notes;
drop policy notes_update on public.team_notes;
drop policy notes_delete on public.team_notes;
create policy strategy_notes_insert on public.team_notes for insert to authenticated
 with check (private.can_scout_event(event_id) and author_user_id=(select auth.uid()) and (select private.has_role('strategy')));
create policy strategy_notes_update on public.team_notes for update to authenticated
 using (private.can_scout_event(event_id) and author_user_id=(select auth.uid()) and (select private.has_role('strategy')))
 with check (private.can_scout_event(event_id) and author_user_id=(select auth.uid()) and (select private.has_role('strategy')));
create policy strategy_notes_delete on public.team_notes for delete to authenticated
 using (private.can_scout_event(event_id) and author_user_id=(select auth.uid()) and (select private.has_role('strategy')));
commit;
