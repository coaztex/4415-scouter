begin;
-- Breaks keep their existing null robot identity, with an explicit match anchor.
alter table public.scouting_assignments add column break_match_id uuid;
alter table public.scouting_assignments add constraint assignment_break_match_fk
 foreign key (break_match_id,event_id) references public.matches(id,event_id);
alter table public.scouting_assignments add constraint assignment_break_anchor_check
 check (assignment_type='break' or break_match_id is null);
create unique index assignments_scout_slot_unique on public.scouting_assignments
 (coalesce(match_id,break_match_id),scout_user_id);

-- Existing final records are authoritative even if older code missed the status.
update public.scouting_assignments a set status='submitted'
 where status<>'submitted' and exists(select 1 from public.match_scouting_submissions s where s.assignment_id=a.id and s.status='final');

create function private.schedule_data(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'event',(select jsonb_build_object('id',id,'tba_key',tba_key,'name',name,'status',status) from public.events where id=target),
 'scouts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'username',username,'role',role) order by id) from public.profiles where active),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(to_jsonb(m) order by sequence) from (
   select id,tba_match_key as key,comp_level,match_number,set_number,scheduled_time,actual_time,
    (row_number() over(order by case comp_level when 'qm' then 0 when 'ef' then 1 when 'qf' then 2 when 'sf' then 3 else 4 end,set_number,match_number,id))::integer as sequence,
    coalesce((select jsonb_agg(jsonb_build_object('team_number',mt.team_number,'alliance',mt.alliance,'station',mt.station) order by mt.alliance,mt.station) from public.match_teams mt where mt.match_id=matches.id),'[]'::jsonb) as stations
   from public.matches where event_id=target
 ) m),'[]'::jsonb),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object(
   'id',a.id,'match_id',a.match_id,'break_match_id',a.break_match_id,'team_number',a.team_number,'scout_user_id',a.scout_user_id,
   'assignment_type',a.assignment_type,'status',a.status,'sequence',a.sequence,'created_at',a.created_at,'updated_at',a.updated_at,
   'scout_name',coalesce(nullif(p.display_name,''),p.username),
   'has_submission',exists(select 1 from public.match_scouting_submissions s where s.assignment_id=a.id),
   'has_final',exists(select 1 from public.match_scouting_submissions s where s.assignment_id=a.id and s.status='final')
 ) order by a.id) from public.scouting_assignments a join public.profiles p on p.id=a.scout_user_id where a.event_id=target),'[]'::jsonb)
 );
$$;
revoke all on function private.schedule_data(uuid) from public,anon,authenticated,service_role;

create function public.get_schedule_snapshot(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare snapshot jsonb;
begin
 if not private.has_role('strategy') or not private.can_read_event(target) then raise exception 'Schedule lead required' using errcode='42501'; end if;
 if (select count(*) from public.scouting_assignments where event_id=target)>10000 or (select count(*) from public.matches where event_id=target)>1000 then
  raise exception 'Event schedule exceeds supported size' using errcode='54000';
 end if;
 snapshot:=private.schedule_data(target);
 return jsonb_build_object('data',snapshot,'version',md5(snapshot::text));
end $$;
revoke all on function public.get_schedule_snapshot(uuid) from public,anon;
grant execute on function public.get_schedule_snapshot(uuid) to authenticated;

-- These mutations must go through checked operations, including for app admins.
revoke insert,update,delete on public.scouting_assignments from authenticated;
create function private.protect_scouting_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
  if old.status in ('in_progress','submitted') or exists(select 1 from public.match_scouting_submissions where assignment_id=old.id) then
   raise exception 'Protected assignment' using errcode='23514';
  end if;
  return old;
 end if;
 if old.status='submitted' and new.status<>'submitted' then raise exception 'Submitted assignment is final' using errcode='23514'; end if;
 if (new.id,new.event_id,new.match_id,new.break_match_id,new.team_number,new.scout_user_id,new.assignment_type) is distinct from
    (old.id,old.event_id,old.match_id,old.break_match_id,old.team_number,old.scout_user_id,old.assignment_type)
 and (old.status in ('in_progress','submitted') or exists(select 1 from public.match_scouting_submissions where assignment_id=old.id)) then
  raise exception 'Protected assignment identity' using errcode='23514';
 end if;
 if exists(select 1 from public.match_scouting_submissions where assignment_id=old.id and status='final') and new.status<>'submitted' then
  raise exception 'Final submission requires submitted assignment' using errcode='23514';
 end if;
 return new;
end $$;
create trigger protect_scouting_assignment before update or delete on public.scouting_assignments
 for each row execute function private.protect_scouting_assignment();
revoke all on function private.protect_scouting_assignment() from public,anon,authenticated,service_role;

-- Submission writes and schedule edits share a lock order: event, then assignment.
-- This prevents a new draft/final racing a preview save or a reassignment.
create function private.lock_submission_schedule() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.events where id=new.event_id for update;
 if new.assignment_id is not null then perform 1 from public.scouting_assignments where id=new.assignment_id for update; end if;
 return new;
end $$;
create trigger assignment_submission_lock before insert or update on public.match_scouting_submissions
 for each row execute function private.lock_submission_schedule();
create function private.update_assignment_submission_status() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.assignment_id is not null then
  update public.scouting_assignments set status=case when new.status='final' then 'submitted'::public.assignment_status else 'in_progress'::public.assignment_status end
  where id=new.assignment_id and (new.status='final' or status='assigned');
 end if;
 return new;
end $$;
create trigger assignment_submission_status after insert or update on public.match_scouting_submissions
 for each row execute function private.update_assignment_submission_status();
revoke all on function private.lock_submission_schedule(),private.update_assignment_submission_status() from public,anon,authenticated,service_role;

create function public.save_scouting_schedule(target uuid, expected_version text, operations jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; r record; seq integer; affected uuid[]; changes integer:=0;
begin
 if not private.has_role('strategy') then raise exception 'Schedule lead required' using errcode='42501'; end if;
 perform 1 from public.events where id=target and status='active' for update;
 if not found then raise exception 'Active event required' using errcode='42501'; end if;
 -- Recheck role under a profile lock to serialize concurrent deactivation.
 perform 1 from public.profiles where id=auth.uid() and active and role in ('strategy','admin') for share;
 if not found then raise exception 'Schedule lead required' using errcode='42501'; end if;
 perform 1 from public.matches where event_id=target order by id for share;
 perform 1 from public.match_teams where event_id=target order by match_id,team_number for share;
 perform 1 from public.scouting_assignments where event_id=target order by id for update;
 snapshot:=private.schedule_data(target);
 if expected_version is distinct from md5(snapshot::text) then raise exception 'Schedule preview is stale' using errcode='40001'; end if;
 if jsonb_typeof(operations->'rows') is distinct from 'array' or jsonb_typeof(operations->'remove_ids') is distinct from 'array' then raise exception 'Invalid schedule plan' using errcode='23514'; end if;
 if jsonb_array_length(operations->'rows')+jsonb_array_length(operations->'remove_ids')>3000 then raise exception 'Too many changes' using errcode='54000'; end if;
 if exists(select 1 from jsonb_to_recordset(operations->'rows') as x(id uuid) where id is not null group by id having count(*)>1) then raise exception 'Duplicate assignment ID' using errcode='23514'; end if;
 select coalesce(array_agg(distinct id),'{}'::uuid[]) into affected from (
  select value::uuid id from jsonb_array_elements_text(operations->'remove_ids')
  union select id from jsonb_to_recordset(operations->'rows') as x(id uuid) where id is not null
 ) x;
 if exists(select 1 from unnest(affected) as ids(id) where not exists(select 1 from public.scouting_assignments a where a.id=ids.id and a.event_id=target)) then raise exception 'Unknown assignment' using errcode='23514'; end if;
 if exists(select 1 from public.scouting_assignments a where a.id=any(affected) and (a.status in ('in_progress','submitted') or exists(select 1 from public.match_scouting_submissions s where s.assignment_id=a.id))) then raise exception 'Protected assignment' using errcode='23514'; end if;
 for r in select * from jsonb_to_recordset(operations->'rows') as x(id uuid,slot_match_id uuid,team_number integer,scout_user_id uuid,assignment_type text,status text) loop
  if r.assignment_type is null or r.assignment_type not in ('match','break') or r.status is null or r.status not in ('assigned','missed') then raise exception 'Invalid assignment values' using errcode='23514'; end if;
  perform 1 from public.profiles where id=r.scout_user_id and active for share;
  if not found then raise exception 'Active scout required' using errcode='23514'; end if;
  if not exists(select 1 from public.matches where id=r.slot_match_id and event_id=target) then raise exception 'Invalid match' using errcode='23514'; end if;
  if r.assignment_type='match' and (r.team_number is null or not exists(select 1 from public.match_teams where match_id=r.slot_match_id and event_id=target and team_number=r.team_number)) then raise exception 'Choose an imported station' using errcode='23514'; end if;
  if r.assignment_type='break' and (r.team_number is not null or r.status<>'assigned') then raise exception 'Invalid break' using errcode='23514'; end if;
 end loop;
 -- Delete/reinsert only editable rows to allow swaps despite immediate unique indexes.
 -- Stable IDs and original creation times are retained. Referenced rows never enter here.
 delete from public.scouting_assignments where id=any(affected);
 for r in select * from jsonb_to_recordset(operations->'rows') as x(id uuid,slot_match_id uuid,team_number integer,scout_user_id uuid,assignment_type text,status text) loop
  select (m->>'sequence')::integer into seq from jsonb_array_elements(snapshot->'matches') m where m->>'id'=r.slot_match_id::text;
  insert into public.scouting_assignments(id,event_id,match_id,break_match_id,team_number,scout_user_id,assignment_type,status,sequence,created_at)
  values(coalesce(r.id,gen_random_uuid()),target,case when r.assignment_type='match' then r.slot_match_id end,
    case when r.assignment_type='break' then r.slot_match_id end,r.team_number,r.scout_user_id,r.assignment_type::public.assignment_type,r.status::public.assignment_status,seq,
    coalesce((select (a->>'created_at')::timestamptz from jsonb_array_elements(snapshot->'assignments') a where a->>'id'=r.id::text),now()));
  changes:=changes+1;
 end loop;
 return changes+jsonb_array_length(operations->'remove_ids');
end $$;
revoke all on function public.save_scouting_schedule(uuid,text,jsonb) from public,anon;
grant execute on function public.save_scouting_schedule(uuid,text,jsonb) to authenticated;

create function public.finish_scout_break(assignment uuid) returns void
language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
 if not private.has_role('scout') then raise exception 'Active scout required' using errcode='42501'; end if;
 select event_id into eid from public.scouting_assignments where id=assignment and scout_user_id=auth.uid() and assignment_type='break';
 perform 1 from public.events where id=eid and status='active' for update;
 if not found then raise exception 'Break unavailable' using errcode='42501'; end if;
 update public.scouting_assignments set status='submitted' where id=assignment and scout_user_id=auth.uid() and assignment_type='break' and status='assigned';
end $$;
revoke all on function public.finish_scout_break(uuid) from public,anon;
grant execute on function public.finish_scout_break(uuid) to authenticated;
commit;
