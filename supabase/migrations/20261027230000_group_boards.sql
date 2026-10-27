-- Group boards: the Week, Month and Year race of a Group, ranked by Standard Points (Progress
-- Points plus Consistency Points). Like my_groups(), this is the only way members see each other's
-- training: scoring_events holds facts (Strength Level percentile, bodyweight) that no other member
-- may see, so the function picks out of each event only its date, its points and, for a Personal
-- Record, its Exercise and % gain.

-- Standard Points a Scoring Event is worth: the sum of its Progress Points and Consistency Points,
-- whichever kinds it has. A Personal Record is dated by its Session's local date, a week of
-- Consistency Points by its Monday.
create function private.event_date(event jsonb) returns date
language sql immutable set search_path = '' as $$
  select (coalesce(event ->> 'localDate', event ->> 'week'))::date
$$;

create function private.event_points(event jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select coalesce((event ->> 'progressPoints')::numeric, 0) + coalesce((event ->> 'consistencyPoints')::numeric, 0)
$$;

revoke execute on function private.event_date(jsonb), private.event_points(jsonb) from public, anon, authenticated;

-- The board of a Group for the Period ('week' from Monday, 'month' or 'year') that contains the
-- caller's local date on_date. Members are those in the Group now, so someone who joined mid-Period
-- brings their whole Period, and someone who left is gone. Tied members share a position (1, 2, 2, 4).
-- Of each member: position, display name, avatar colour, whether it is the caller, points, the
-- Weekly Target and local dates of the Sessions that counted in the week of on_date, and their latest
-- three Personal Records of the Period (Exercise, % gain, points). Nothing else.
create function public.group_board(group_id uuid, period text, on_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  first_day date;
  next_day date;
  this_week date := date_trunc('week', group_board.on_date::timestamp)::date;
begin
  if not exists (select from public.group_members m where m.group_id = group_board.group_id and m.user_id = me) then
    raise exception 'not_member';
  end if;
  if group_board.period not in ('week', 'month', 'year') then
    raise exception 'invalid_period';
  end if;
  first_day := date_trunc(group_board.period, group_board.on_date::timestamp)::date;
  next_day := (first_day + ('1 ' || group_board.period)::interval)::date;

  return jsonb_build_object('members', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'position', r.position,
        'display_name', r.display_name,
        'avatar_color', r.avatar_color,
        'me', r.user_id = me,
        'points', r.points,
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
    from (
      select
        rank() over (order by s.points desc) as position,
        s.user_id, s.display_name, s.avatar_color, s.points
      from (
        select m.user_id, pr.display_name, pr.avatar_color, coalesce(sum(private.event_points(e.event)), 0) as points
        from public.group_members m
        join public.profiles pr on pr.user_id = m.user_id
        left join public.scoring_events e
          on e.user_id = m.user_id
          and private.event_date(e.event) >= first_day and private.event_date(e.event) < next_day
        where m.group_id = group_board.group_id
        group by m.user_id, pr.display_name, pr.avatar_color
      ) s
    ) r
  ), '[]'::jsonb));
end;
$$;

revoke execute on function public.group_board(uuid, text, date) from public, anon;
grant execute on function public.group_board(uuid, text, date) to authenticated;
