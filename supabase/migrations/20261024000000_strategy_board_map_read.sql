begin;
-- Scouts receive only map data. Full documents (including phase notes) remain
-- protected by the existing strategy/admin table policy and write RPC.
create function public.read_strategy_board_map(target_event uuid, target_match uuid)
returns table(board_data jsonb, schema_version integer, revision bigint, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.has_role('scout') or not private.can_read_event(target_event) then
  raise exception 'Board view forbidden' using errcode='42501';
 end if;
 return query
 select jsonb_build_object(
   'schemaVersion', b.board_data->'schemaVersion',
   'gameSlug', b.board_data->'gameSlug',
   'phases', coalesce((select jsonb_object_agg(p.key, jsonb_build_object(
     'objects', coalesce(p.value->'objects','[]'::jsonb),
     'markers', coalesce(p.value->'markers','[]'::jsonb),
     'notes', ''
   )) from jsonb_each(b.board_data->'phases') p), '{}'::jsonb)
 ), b.schema_version, b.revision, b.updated_at
 from public.strategy_boards b
 where b.event_id=target_event and b.match_id=target_match;
end $$;
revoke all on function public.read_strategy_board_map(uuid,uuid) from public, anon;
grant execute on function public.read_strategy_board_map(uuid,uuid) to authenticated;
commit;
