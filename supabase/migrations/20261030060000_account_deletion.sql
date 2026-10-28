-- Account deletion (#30). delete_account() erases the caller: it removes them from their Groups as
-- leave_group() does (the Owner's role passes on, an empty Group is deleted), makes their frozen
-- Period results anonymous, and deletes their auth user, which cascades to everything else they
-- own (profile, Sessions, Sets, Scoring Events, histories, Routines, Custom Exercises, Increment
-- overrides, Deload Weeks, crown views, sync bookkeeping).

-- A frozen result of a deleted user keeps its place and points but loses the name, the colour and
-- the link to the user: the boards show it as a former member.
alter table public.period_results add column former boolean not null default false;

-- period_standings() with a former flag. Live standings are never former.
drop function private.period_standings(uuid, text, date, date, text);
create function private.period_standings(group_id uuid, period text, first_day date, next_day date, mode text)
returns table (user_id uuid, display_name text, avatar_color text, points numeric, "position" bigint, former boolean)
language sql stable set search_path = '' as $$
  select f.user_id, f.display_name, f.avatar_color, f.points, f.position::bigint, f.former
  from public.period_results f
  where f.group_id = period_standings.group_id and f.period = period_standings.period and f.first_day = period_standings.first_day
  union all
  select l.user_id, l.display_name, l.avatar_color, l.points, l."position", false
  from private.live_standings(period_standings.group_id, period_standings.first_day, period_standings.next_day, period_standings.mode) l
  where not exists (
    select from public.period_results f
    where f.group_id = period_standings.group_id and f.period = period_standings.period and f.first_day = period_standings.first_day
  )
$$;
revoke execute on function private.period_standings(uuid, text, date, date, text) from public, anon, authenticated;

-- group_board() as 20261030030000_period_results.sql left it, plus a former flag on each member
-- (no Rank for a former member). Nothing else changed.
create or replace function public.group_board(group_id uuid, period text, on_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  first_day date;
  next_day date;
  this_week date := date_trunc('week', group_board.on_date::timestamp)::date;
  mode text;
begin
  if not exists (select from public.group_members m where m.group_id = group_board.group_id and m.user_id = me) then
    raise exception 'not_member';
  end if;
  if group_board.period not in ('week', 'month', 'year') then
    raise exception 'invalid_period';
  end if;
  first_day := date_trunc(group_board.period, group_board.on_date::timestamp)::date;
  next_day := (first_day + ('1 ' || group_board.period)::interval)::date;
  mode := case when group_board.period = 'year' then 'standard' else private.scoring_mode(group_board.group_id, first_day) end;

  return jsonb_build_object(
    'scoring_mode', mode,
    'next_scoring_mode', coalesce((
      select m.mode from public.group_scoring_modes m
      where m.group_id = group_board.group_id order by m.changed_on desc limit 1
    ), 'standard'),
    'members', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'user_id', r.user_id,
        'position', r.position,
        'display_name', r.display_name,
        'avatar_color', r.avatar_color,
        'former', r.former,
        'me', r.user_id = me,
        'points', r.points,
        'tier', case when r.former then null else private.rank_of(private.season_rank_points(r.user_id, group_board.on_date)) -> 'tier' end,
        'division', case when r.former then null else private.rank_of(private.season_rank_points(r.user_id, group_board.on_date)) -> 'division' end,
        'weekly_target', coalesce(
          (select (e.event ->> 'weeklyTarget')::int from public.scoring_events e
            where e.user_id = r.user_id and e.event ->> 'kind' = 'consistency' and (e.event ->> 'week')::date = this_week),
          (select (h.value #>> '{}')::int from public.profile_history h
            where h.user_id = r.user_id and h.field = 'weeklyTarget' and h.effective_from <= group_board.on_date
            order by h.effective_from desc limit 1)
        ),
        'session_dates', coalesce(
          (select e.event -> 'sessionDates' from public.scoring_events e
            where e.user_id = r.user_id and e.event ->> 'kind' = 'consistency' and (e.event ->> 'week')::date = this_week),
          '[]'::jsonb
        ),
        'records', coalesce((
          select jsonb_agg(jsonb_build_object(
            'exercise', p.event ->> 'exercise',
            'percent_gain', (p.event ->> 'percentGain')::numeric,
            'points', (p.event ->> 'progressPoints')::numeric
          ) order by private.event_date(p.event) desc, p.id)
          from (
            select e.id, e.event from public.scoring_events e
            where e.user_id = r.user_id and e.event ->> 'kind' = 'personal-record'
              and private.event_date(e.event) >= first_day and private.event_date(e.event) < next_day
            order by private.event_date(e.event) desc, e.id
            limit 3
          ) p
        ), '[]'::jsonb)
      )
      order by r.position, r.display_name, r.user_id
    )
    from private.period_standings(group_board.group_id, group_board.period, first_day, next_day, mode) r
  ), '[]'::jsonb));
end;
$$;

create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  member_of uuid;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  for member_of in select m.group_id from public.group_members m where m.user_id = me loop
    perform public.leave_group(member_of);
  end loop;
  update public.period_results
  set user_id = gen_random_uuid(), display_name = '', avatar_color = '', former = true
  where user_id = me;
  -- Season results are the user's own Rank history: nothing to keep.
  delete from public.season_results where user_id = me;
  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
