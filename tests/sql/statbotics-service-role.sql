begin;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);

-- The service role must reach payload validation without calling the private
-- admin helper, whose schema is intentionally unavailable to that role.
do $$
begin
  begin
    perform public.apply_statbotics_snapshot('{}'::jsonb);
    raise exception 'Invalid service snapshot was accepted';
  exception when raise_exception then
    if SQLERRM <> 'Invalid event snapshot' then raise; end if;
  end;
end $$;

rollback;
