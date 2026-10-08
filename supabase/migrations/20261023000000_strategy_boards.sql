begin;
create table public.strategy_boards (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null,
 match_id uuid not null unique,
 schema_version integer not null default 1 check (schema_version = 1),
 board_data jsonb not null check (jsonb_typeof(board_data) = 'object' and octet_length(board_data::text) <= 1000000),
 revision bigint not null default 1 check (revision > 0),
 created_by uuid not null references public.profiles(id),
 updated_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (match_id,event_id) references public.matches(id,event_id)
);
create index strategy_boards_event_idx on public.strategy_boards(event_id);
create trigger touch_updated_at before update on public.strategy_boards
 for each row execute function private.touch_updated_at();
alter table public.strategy_boards enable row level security;
revoke all on public.strategy_boards from public, anon, authenticated;
grant select on public.strategy_boards to authenticated;
grant all on public.strategy_boards to service_role;
create policy strategy_boards_read on public.strategy_boards for select to authenticated
 using (private.can_read_event(event_id) and private.has_role('strategy'));

-- All app writes use this compare-and-swap RPC; direct DML cannot bypass revisions.
create function public.save_strategy_board(target_event uuid, target_match uuid, expected_revision bigint, document jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare current_revision bigint; actor uuid := (select auth.uid());
begin
 if actor is null or not private.has_role('strategy') or not private.can_scout_event(target_event) then
  raise exception 'Strategy edit forbidden' using errcode='42501';
 end if;
 if not exists(select 1 from public.matches where id=target_match and event_id=target_event) then
  raise exception 'Match unavailable' using errcode='23503';
 end if;
 if expected_revision is null or expected_revision < 0 or document is null
  or jsonb_typeof(document) <> 'object' or document->>'schemaVersion' is distinct from '1'
  or jsonb_typeof(document->'phases') is distinct from 'object'
  or document->>'gameSlug' is distinct from (select game_slug from public.events where id=target_event)
  or octet_length(document::text) > 1000000 then
  raise exception 'Invalid board document' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(target_match::text,0));
 select revision into current_revision from public.strategy_boards where match_id=target_match for update;
 if coalesce(current_revision,0) <> expected_revision then
  raise exception 'Board revision conflict' using errcode='P0001';
 end if;
 if current_revision is null then
  insert into public.strategy_boards(event_id,match_id,board_data,created_by,updated_by)
   values(target_event,target_match,document,actor,actor);
  return 1;
 end if;
 update public.strategy_boards set board_data=document,revision=current_revision+1,updated_by=actor where match_id=target_match;
 return current_revision+1;
end $$;
revoke all on function public.save_strategy_board(uuid,uuid,bigint,jsonb) from public, anon;
grant execute on function public.save_strategy_board(uuid,uuid,bigint,jsonb) to authenticated;
commit;
