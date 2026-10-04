begin;
insert into auth.users (id, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000002', '{"role":"admin","active":true,"username":"admin"}'),
 ('00000000-0000-0000-0000-000000000003', '{}');
do $$ begin
 if not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-000000000002' and role = 'scout' and not active and approval_pending and username = 'admin') then raise exception 'Unsafe defaults'; end if;
 if not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-000000000001') then raise exception 'Backfill failed'; end if;
end $$;
update public.profiles set username = ' Team_Scout ', active = true where id = '00000000-0000-0000-0000-000000000002';
update public.profiles set active = true where id = '00000000-0000-0000-0000-000000000003';
do $$ begin
 if not exists (select 1 from public.profiles where username = 'team_scout' and updated_at > created_at) then raise exception 'Normalization/timestamps failed'; end if;
 begin
  update public.profiles set username = 'TEAM_SCOUT' where id = '00000000-0000-0000-0000-000000000003';
  raise exception 'Duplicate username accepted';
 exception when unique_violation then null; end;
 begin
  update public.profiles set username = 'bad name' where id = '00000000-0000-0000-0000-000000000003';
  raise exception 'Invalid username accepted';
 exception when check_violation then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$ begin
 if (select count(id) from public.profiles) <> 1 then raise exception 'Inactive user sees directory'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$ begin
 if (select count(id) from public.profiles) <> 2 then raise exception 'Active directory failed'; end if;
 begin
  update public.profiles set role = 'admin' where id = auth.uid();
  raise exception 'Role escalation allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.profiles set active = true where id = auth.uid();
  raise exception 'Activation allowed';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.profiles where id = auth.uid();
  raise exception 'Client delete allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.profiles (id, username) values (auth.uid(), 'replacement');
  raise exception 'Client insert allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform created_at from public.profiles;
  raise exception 'Private columns visible';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin
  perform id from public.profiles;
  raise exception 'Anonymous read allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role service_role;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000002';
reset role;
do $$ begin
 if not exists (select 1 from public.profiles where role = 'admin') then raise exception 'Server write failed'; end if;
end $$;
delete from auth.users where id = '00000000-0000-0000-0000-000000000003';
do $$ begin
 if exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-000000000003') then raise exception 'Cascade failed'; end if;
end $$;
rollback;
