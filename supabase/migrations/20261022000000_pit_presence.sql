begin;

-- Expose completion existence, never other scouts' report content/identity.
create function public.get_event_pit_completion(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.can_read_event(target) then raise exception 'Event access required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(team_number order by team_number),'[]'::jsonb) into result
 from (select distinct team_number from public.pit_scouting_submissions where event_id=target and status='final') teams;
 return result;
end $$;
revoke all on function public.get_event_pit_completion(uuid) from public,anon;
grant execute on function public.get_event_pit_completion(uuid) to authenticated,service_role;

create trigger signal_pit_scouting_coverage
after insert or update of status or delete on public.pit_scouting_submissions
for each row execute function private.signal_scouting_coverage();

-- Only active authenticated event users join the ephemeral event topic.
create function private.can_use_pit_presence(topic text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare target uuid;
begin
 if topic is null or topic !~ '^pit-presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
 target := substring(topic from 14)::uuid;
 return private.can_read_event(target) and exists(select 1 from public.events where id=target and status='active');
end $$;
revoke all on function private.can_use_pit_presence(text) from public,anon;
grant execute on function private.can_use_pit_presence(text) to authenticated;

-- Supabase owns this schema: add policies only; never alter its tables.
do $$ begin
 if to_regclass('realtime.messages') is not null then
  execute $policy$create policy pit_presence_receive on realtime.messages for select to authenticated
   using (extension='presence' and private.can_use_pit_presence((select realtime.topic())))$policy$;
  execute $policy$create policy pit_presence_publish on realtime.messages for insert to authenticated
   with check (extension='presence' and private.can_use_pit_presence((select realtime.topic())))$policy$;
 end if;
end $$;

commit;
