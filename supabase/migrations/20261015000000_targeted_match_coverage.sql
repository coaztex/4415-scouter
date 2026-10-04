begin;
-- Match Details needs only six coverage rows, not the event-wide schedule snapshot.
create function public.get_match_coverage(target_event uuid, target_match uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.has_role('scout') or not private.can_read_event(target_event) then
  raise exception 'Event access required' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'match_id',mt.match_id,'team_number',mt.team_number,
  'completed_count',(select count(*) from public.match_scouting_submissions s
    where s.event_id=target_event and s.match_id=target_match and s.team_number=mt.team_number
    and s.status='final' and s.completed_at is not null),
  'in_progress',exists(select 1 from public.match_scouting_submissions s
    where s.event_id=target_event and s.match_id=target_match and s.team_number=mt.team_number and s.status='draft')
    or exists(select 1 from public.scouting_assignments a
    where a.event_id=target_event and a.match_id=target_match and a.team_number=mt.team_number and a.status='in_progress')
 ) order by mt.team_number),'[]'::jsonb) into result
 from public.match_teams mt where mt.event_id=target_event and mt.match_id=target_match;
 return result;
end $$;
revoke all on function public.get_match_coverage(uuid,uuid) from public,anon;
grant execute on function public.get_match_coverage(uuid,uuid) to authenticated;
commit;
