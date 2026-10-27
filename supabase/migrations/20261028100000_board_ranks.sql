-- Board rows carry each member's Rank (Tier and Division): spec says Rank is always visible to Group
-- members. Only the Tier and Division leave the function, never the Season Rank Points behind them.

-- The Tier and Division a number of Season Rank Points falls in. These cutoffs mirror rank.ts in the
-- rules package (TIER_CUTOFFS, ELITE_CUTOFF); keep the two in step. Elite has no Division.
create function private.rank_of(points numeric) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when rank_of.points >= 3000 then jsonb_build_object('tier', 'elite', 'division', null)
    else (
      select jsonb_build_object('tier', c.tier, 'division', 5 - floor((rank_of.points - c.start) / c.span)::int)
      from (values ('bronze', 0, 60), ('silver', 300, 100), ('gold', 800, 180), ('diamond', 1700, 260)) as c(tier, start, span)
      where rank_of.points >= c.start
      order by c.start desc
      limit 1
    )
  end
$$;

revoke execute on function private.rank_of(numeric) from public, anon, authenticated;

-- The Season Rank Points a user holds on a date: their Points in the calendar quarter holding it
-- (starting points are 0 until Season finalization, #28), as season_standing() counts them.
create function private.season_rank_points(user_id uuid, on_date date) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(sum(private.event_points(e.event)), 0)
  from public.scoring_events e
  where e.user_id = season_rank_points.user_id
    and private.event_date(e.event) >= date_trunc('quarter', season_rank_points.on_date)::date
    and private.event_date(e.event) < (date_trunc('quarter', season_rank_points.on_date) + interval '3 months')::date
$$;

revoke execute on function private.season_rank_points(uuid, date) from public, anon, authenticated;

-- group_board() as before (see 20261027230000_group_boards.sql), with each member's 'tier' and
-- 'division' added.
create or replace function public.group_board(group_id uuid, period text, on_date date) returns jsonb
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
        'tier', private.rank_of(private.season_rank_points(r.user_id, group_board.on_date)) -> 'tier',
        'division', private.rank_of(private.season_rank_points(r.user_id, group_board.on_date)) -> 'division',
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
