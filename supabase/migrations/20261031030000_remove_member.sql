-- The Owner removes a member from their Group. The member just loses the Group: their own Points,
-- Rank and Sessions stay, and the Group's boards stop showing them, as when someone leaves. They can
-- rejoin with the invite link while it's still live, which is why removing can go with a reset.
create function public.remove_member(group_id uuid, user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := private.group_owner(remove_member.group_id);
begin
  if owner is distinct from (select auth.uid()) then
    raise exception 'not_owner';
  end if;
  if remove_member.user_id = owner then
    raise exception 'cannot_remove_owner';
  end if;
  delete from public.group_members m
  where m.group_id = remove_member.group_id and m.user_id = remove_member.user_id;
end;
$$;

revoke execute on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- my_groups() again, rebuilt from 20261026070656_groups.sql, with each member's id added so the
-- Owner can remove them (member profiles and boards already show these ids to members).
create or replace function public.my_groups() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'invite_code', g.invite_code,
        'members', (
          select jsonb_agg(
            jsonb_build_object(
              'user_id', m.user_id,
              'display_name', p.display_name,
              'avatar_color', p.avatar_color,
              'owner', m.user_id = private.group_owner(g.id),
              'me', m.user_id = mine.user_id
            )
            order by m.joined_at, m.user_id
          )
          from public.group_members m
          left join public.profiles p on p.user_id = m.user_id
          where m.group_id = g.id
        )
      )
      order by mine.joined_at, g.id
    ),
    '[]'::jsonb
  )
  from public.group_members mine
  join public.groups g on g.id = mine.group_id
  where mine.user_id = (select auth.uid())
$$;
