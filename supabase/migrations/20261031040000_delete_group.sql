-- The Owner deletes their Group for everyone. Everything that hangs off a Group (memberships, scoring
-- mode settings, Period results, and so the crowns not yet seen) goes with it through on delete
-- cascade; a lifter's own Points, Rank, Season results, Sessions and Personal Records are not tied
-- to a Group and stay.
create function public.delete_group(group_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.group_owner(delete_group.group_id) is distinct from (select auth.uid()) then
    raise exception 'not_owner';
  end if;
  delete from public.groups g where g.id = delete_group.group_id;
end;
$$;

revoke execute on function public.delete_group(uuid) from public, anon;
grant execute on function public.delete_group(uuid) to authenticated;
