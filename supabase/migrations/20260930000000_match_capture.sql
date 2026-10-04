begin;
alter table public.match_scouting_submissions add column submitted_by_user_id uuid references public.profiles(id);
-- Match writes now pass the typed server service; RLS remains the read boundary.
revoke insert,update,delete on public.match_scouting_submissions from authenticated;

create function public.start_match_capture(actor uuid, target uuid, expected_scout uuid, expected_match uuid, expected_team integer, allow_override boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare a public.scouting_assignments; p public.profiles; eid uuid;
begin
 select event_id into eid from public.scouting_assignments where id=target;
 perform 1 from public.events where id=eid and status='active' and game_slug='2026-rebuilt' for update;
 if not found then raise exception 'Active REBUILT event required' using errcode='42501'; end if;
 select * into p from public.profiles where id=actor and active for share;
 if not found then raise exception 'Active account required' using errcode='42501'; end if;
 select * into a from public.scouting_assignments where id=target for update;
 if a.assignment_type<>'match' or a.status in ('submitted','missed') then raise exception 'Assignment closed' using errcode='23514'; end if;
 if (a.scout_user_id,a.match_id,a.team_number) is distinct from (expected_scout,expected_match,expected_team) then raise exception 'Assignment changed' using errcode='40001'; end if;
 if a.scout_user_id<>actor and not (allow_override and p.role in ('strategy','admin')) then raise exception 'Assignment belongs to another scout' using errcode='42501'; end if;
 update public.scouting_assignments set status='in_progress' where id=target and status='assigned';
end $$;
revoke all on function public.start_match_capture(uuid,uuid,uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.start_match_capture(uuid,uuid,uuid,uuid,integer,boolean) to service_role;

create function public.submit_match_capture(actor uuid, target uuid, expected_scout uuid, expected_match uuid, expected_team integer, client_id uuid, payload jsonb, started timestamptz, completed timestamptz, allow_override boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.scouting_assignments; p public.profiles; existing public.match_scouting_submissions; eid uuid; result uuid;
begin
 select event_id into eid from public.scouting_assignments where id=target;
 perform 1 from public.events where id=eid and status='active' and game_slug='2026-rebuilt' for update;
 if not found then raise exception 'Active REBUILT event required' using errcode='42501'; end if;
 select * into p from public.profiles where id=actor and active for share;
 if not found then raise exception 'Active account required' using errcode='42501'; end if;
 select * into a from public.scouting_assignments where id=target for update;
 if a.assignment_type<>'match' then raise exception 'Robot assignment required' using errcode='23514'; end if;
 if (a.scout_user_id,a.match_id,a.team_number) is distinct from (expected_scout,expected_match,expected_team) then raise exception 'Assignment changed' using errcode='40001'; end if;
 if a.scout_user_id<>actor and not (allow_override and p.role in ('strategy','admin')) then raise exception 'Assignment belongs to another scout' using errcode='42501'; end if;
 if started is null or completed is null or completed<started or client_id is null or jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid capture' using errcode='23514'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(payload->'issues','[]')) i where i ? 'confirmed_cause') then raise exception 'Reviewer causes are not capture fields' using errcode='23514'; end if;
 select * into existing from public.match_scouting_submissions where client_submission_id=client_id;
 if found then
  if existing.assignment_id=target and existing.submitted_by_user_id=actor and existing.game_data=payload and existing.started_at=started and existing.completed_at=completed and existing.status='final' then return existing.id; end if;
  raise exception 'Submission ID already used with different content' using errcode='23505';
 end if;
 if a.status in ('submitted','missed') or exists(select 1 from public.match_scouting_submissions where assignment_id=target) then raise exception 'Assignment already closed or has a separate record; review required' using errcode='23514'; end if;
 insert into public.match_scouting_submissions(client_submission_id,event_id,match_id,team_number,assignment_id,scout_user_id,submitted_by_user_id,game_slug,schema_version,game_data,issues,note,status,started_at,completed_at)
 values(client_id,a.event_id,a.match_id,a.team_number,a.id,a.scout_user_id,actor,'2026-rebuilt',2,payload,coalesce(payload->'issues','[]'),payload#>>'{post_match,important_note}','final',started,completed) returning id into result;
 -- Existing submission trigger marks the assignment submitted in this transaction.
 return result;
end $$;
revoke all on function public.submit_match_capture(uuid,uuid,uuid,uuid,integer,uuid,jsonb,timestamptz,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.submit_match_capture(uuid,uuid,uuid,uuid,integer,uuid,jsonb,timestamptz,timestamptz,boolean) to service_role;
commit;
