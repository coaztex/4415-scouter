begin;
alter table public.event_teams add column pit_claimed_by uuid references public.profiles(id);
alter table public.event_teams add column pit_claimed_at timestamptz;
create index event_teams_pit_claim_idx on public.event_teams(pit_claimed_by) where pit_claimed_by is not null;

-- All pit mutations pass the verified server action and locked RPC.
revoke insert, update, delete on public.pit_scouting_submissions from authenticated;
-- The foundation granted table-wide UPDATE, which overrides column revokes.
-- Event-team writes from the app already use the service-side import/pit paths.
revoke update on public.event_teams from authenticated;

create function public.claim_pit_team(actor uuid, target_event uuid, target_team integer, takeover boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare member public.event_teams; person public.profiles;
begin
 perform 1 from public.events where id=target_event and status='active' and game_slug='2026-rebuilt' for update;
 if not found then raise exception 'Active REBUILT event required' using errcode='42501'; end if;
 select * into person from public.profiles where id=actor and active for share;
 if not found then raise exception 'Active scout required' using errcode='42501'; end if;
 select * into member from public.event_teams where event_id=target_event and team_number=target_team for update;
 if not found or member.pit_status='completed' then raise exception 'Pit report closed' using errcode='23514'; end if;
 if member.pit_claimed_by is not null and member.pit_claimed_by<>actor and not takeover then
  raise exception 'Pit work is claimed by another scout' using errcode='40001';
 end if;
 update public.event_teams set pit_claimed_by=actor,pit_claimed_at=now(),pit_status='in_progress'
  where event_id=target_event and team_number=target_team;
end $$;
revoke all on function public.claim_pit_team(uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.claim_pit_team(uuid,uuid,integer,boolean) to service_role;

create function public.save_pit_capture(actor uuid, target_event uuid, target_team integer,
 client_id uuid, payload jsonb, finalize boolean, expected_revision integer, takeover boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare member public.event_teams; person public.profiles; old public.pit_scouting_submissions; stored public.pit_scouting_submissions;
begin
 perform 1 from public.events where id=target_event and status='active' and game_slug='2026-rebuilt' for update;
 if not found then raise exception 'Active REBUILT event required' using errcode='42501'; end if;
 select * into person from public.profiles where id=actor and active for share;
 if not found then raise exception 'Active scout required' using errcode='42501'; end if;
 select * into member from public.event_teams where event_id=target_event and team_number=target_team for update;
 if not found then raise exception 'Event team missing' using errcode='23514'; end if;
 if client_id is null or jsonb_typeof(payload) is distinct from 'object' or expected_revision is null or expected_revision<0 then
  raise exception 'Invalid pit capture' using errcode='23514'; end if;
 select * into old from public.pit_scouting_submissions where client_submission_id=client_id for update;
 if found and (old.event_id<>target_event or old.team_number<>target_team or old.scout_user_id<>actor) then
  raise exception 'Submission ID belongs to another report' using errcode='23505'; end if;
 -- Lost response after a final commit: identical UUID/content retries succeed.
 if found and old.status='final' then
  if finalize and old.game_data=payload then return jsonb_build_object('id',old.id,'revision',old.revision,'status','final'); end if;
  raise exception 'Final pit report cannot be rewritten' using errcode='23514'; end if;
 if member.pit_status='completed' or exists(select 1 from public.pit_scouting_submissions
   where event_id=target_event and team_number=target_team and status='final') then
  raise exception 'A final report already exists; explicit review is required' using errcode='23514'; end if;
 if member.pit_claimed_by is not null and member.pit_claimed_by<>actor and not takeover then
  raise exception 'Pit work is claimed by another scout' using errcode='40001'; end if;
 if found and old.revision<>expected_revision then raise exception 'Pit draft changed' using errcode='40001'; end if;
 if not found and expected_revision<>0 then raise exception 'Pit draft missing' using errcode='40001'; end if;
 if found then
  update public.pit_scouting_submissions set game_data=payload,
   status=case when finalize then 'final'::public.submission_status else 'draft'::public.submission_status end,
   completed_at=case when finalize then now() else null end
   where id=old.id returning * into stored;
 else
  insert into public.pit_scouting_submissions(client_submission_id,event_id,team_number,scout_user_id,
    game_slug,schema_version,game_data,status,completed_at)
  values(client_id,target_event,target_team,actor,'2026-rebuilt',2,payload,
    case when finalize then 'final'::public.submission_status else 'draft'::public.submission_status end,
    case when finalize then now() else null end) returning * into stored;
 end if;
 update public.event_teams set pit_claimed_by=actor,pit_claimed_at=now(),
  pit_status=case when finalize then 'completed'::public.pit_status else 'in_progress'::public.pit_status end
  where event_id=target_event and team_number=target_team;
 return jsonb_build_object('id',stored.id,'revision',stored.revision,'status',stored.status);
end $$;
revoke all on function public.save_pit_capture(uuid,uuid,integer,uuid,jsonb,boolean,integer,boolean) from public,anon,authenticated;
grant execute on function public.save_pit_capture(uuid,uuid,integer,uuid,jsonb,boolean,integer,boolean) to service_role;
commit;
