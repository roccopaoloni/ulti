-- Groups: who belongs to which Group, and the display name and avatar colour members see of each
-- other. The app reaches Groups only through the functions at the end, never through the tables, so
-- members see of each other exactly what my_groups() returns. Each function checks who is calling.

-- Helpers that only the functions below call. Nobody else can reach this schema.
create schema if not exists private;

-- Each user's own settings, read and written only by that user. Members see the display name and
-- avatar colour through my_groups(). Both stay empty until the user creates or joins a Group, so
-- later settings (units, language) can be added as columns of the same row.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name = btrim(display_name) and char_length(display_name) between 1 and 30),
  avatar_color text check (avatar_color ~ '^#[0-9a-f]{6}$')
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

create policy "Users read their own profile" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create their own profile" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users change their own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- A random code for an invite link: 22 URL-safe characters (122 random bits), too many to guess.
create function private.new_invite_code() returns text
language sql volatile set search_path = '' as $$
  select translate(encode(uuid_send(gen_random_uuid()), 'base64'), '+/=', '-_')
$$;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  -- Anyone with the current code can join.
  invite_code text not null unique default private.new_invite_code()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_id_idx on public.group_members (user_id);

-- No policies: only the functions below, which run as the tables' owner, read or change them.
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
revoke all on public.groups, public.group_members from anon, authenticated;

-- The Owner is the longest-standing member: the creator, and once they leave, whoever joined next.
create function private.group_owner(group_id uuid) returns uuid
language sql stable set search_path = '' as $$
  select m.user_id
  from public.group_members m
  where m.group_id = group_owner.group_id
  order by m.joined_at, m.user_id
  limit 1
$$;

-- Members are shown by name and colour, so creating or joining a Group needs both.
create function private.require_profile(user_id uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not exists (
    select from public.profiles p
    where p.user_id = require_profile.user_id and p.display_name is not null and p.avatar_color is not null
  ) then
    raise exception 'profile_incomplete';
  end if;
end;
$$;

revoke execute on function private.new_invite_code(), private.group_owner(uuid), private.require_profile(uuid)
  from public, anon, authenticated;

-- Creates a Group with the caller as its only member, which makes them its Owner. Returns its id.
create function public.create_group(name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  created uuid;
begin
  perform private.require_profile(me);
  insert into public.groups (name) values (btrim(create_group.name)) returning id into created;
  insert into public.group_members (group_id, user_id) values (created, me);
  return created;
end;
$$;

-- Adds the caller to the Group whose current invite code this is, and returns its id. A member who
-- opens the link again stays as they were, so they keep their place in line to become Owner.
create function public.join_group(invite_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  joined uuid;
begin
  perform private.require_profile(me);
  select g.id into joined from public.groups g where g.invite_code = join_group.invite_code;
  if joined is null then
    raise exception 'invite_not_found';
  end if;
  insert into public.group_members (group_id, user_id) values (joined, me) on conflict do nothing;
  return joined;
end;
$$;

-- The caller's Groups, in the order they joined them, each with its invite code and its members from
-- the longest-standing (the Owner) down. Of each member: display name, avatar colour, whether they
-- are the Owner and whether they are the caller. Nothing else.
create function public.my_groups() returns jsonb
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

-- Signed-in users only: every function works on the caller's own account.
revoke execute on function public.create_group(text), public.join_group(text), public.my_groups()
  from public, anon;
grant execute on function public.create_group(text), public.join_group(text), public.my_groups()
  to authenticated;
