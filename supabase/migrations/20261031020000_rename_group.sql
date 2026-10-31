-- The Owner renames the Group; every member sees the new name through my_groups(). The name follows
-- the same rules as when creating a Group (1-40 characters once trimmed), enforced by the column's check.
create function public.rename_group(group_id uuid, name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.group_owner(rename_group.group_id) is distinct from (select auth.uid()) then
    raise exception 'not_owner';
  end if;
  update public.groups g set name = btrim(rename_group.name) where g.id = rename_group.group_id;
end;
$$;

revoke execute on function public.rename_group(uuid, text) from public, anon;
grant execute on function public.rename_group(uuid, text) to authenticated;
