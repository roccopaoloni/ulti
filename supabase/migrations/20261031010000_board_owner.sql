-- group_board() as 20261030060000_account_deletion.sql left it, plus an owner flag on each member
-- (#96), so the board can tag the Group's Owner. Nothing else changed.
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
        'owner', r.user_id = private.group_owner(group_board.group_id),
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
