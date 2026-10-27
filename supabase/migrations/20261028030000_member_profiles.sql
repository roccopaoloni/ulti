-- Visibility and member profiles. Visibility is one per-user setting that applies in every Group
-- (ADR 0002): actual weights and reps, and full Session details, both off by default. The user sets
-- them on their own profile row; member_profile() is the only way another member reads anything of
-- their training, and it enforces the choice here on the server.
alter table public.profiles
  add column share_weights boolean not null default false,
  add column share_sessions boolean not null default false;

-- A member's profile for the Period ('week', 'month' or 'year') that contains the caller's local
-- date on_date. Always: position, points, Session count and the Period's Personal Records with
-- their Exercise, % gain and points. Only if the member allows it: the weight and reps of each
-- Personal Record (share_weights), and the Period's Sessions with the Exercise of every Set
-- (share_sessions), which carry the weight and reps of every Set only if share_weights is on too.
-- Sex, bodyweight and Strength Level are never read: like group_board(), this picks fields out of
-- each event instead of passing the event on.
create function public.member_profile(group_id uuid, member_id uuid, period text, on_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  first_day date;
  next_day date;
  result jsonb;
begin
  if not exists (select from public.group_members m where m.group_id = member_profile.group_id and m.user_id = me)
    or not exists (select from public.group_members m where m.group_id = member_profile.group_id and m.user_id = member_profile.member_id) then
    raise exception 'not_member';
  end if;
  if member_profile.period not in ('week', 'month', 'year') then
    raise exception 'invalid_period';
  end if;
  first_day := date_trunc(member_profile.period, member_profile.on_date::timestamp)::date;
  next_day := (first_day + ('1 ' || member_profile.period)::interval)::date;

  select jsonb_build_object(
    'display_name', r.display_name,
    'avatar_color', r.avatar_color,
    'me', r.user_id = me,
    'position', r.position,
    'points', r.points,
    'session_count', (
      select count(*) from public.sessions s
      where s.user_id = r.user_id and s.finished_at is not null
        and s.local_date >= first_day and s.local_date < next_day
        and exists (select from public.sets t where t.user_id = s.user_id and t.session_id = s.id and not t.deleted)
    ),
    'shares_weights', r.share_weights,
    'shares_sessions', r.share_sessions,
    'records', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'exercise', e.event ->> 'exercise',
          'percent_gain', (e.event ->> 'percentGain')::numeric,
          'points', (e.event ->> 'progressPoints')::numeric,
          'local_date', private.event_date(e.event)
        ) || case when r.share_weights then jsonb_build_object('weight_kg', t.weight_kg, 'reps', t.reps) else '{}'::jsonb end
        order by private.event_date(e.event) desc, e.id
      )
      from public.scoring_events e
      left join public.sets t on t.user_id = e.user_id and t.id::text = e.event ->> 'setId'
      where e.user_id = r.user_id and e.event ->> 'kind' = 'personal-record'
        and private.event_date(e.event) >= first_day and private.event_date(e.event) < next_day
    ), '[]'::jsonb),
    'sessions', case when r.share_sessions then coalesce((
      select jsonb_agg(
        jsonb_build_object('local_date', s.local_date, 'sets', coalesce((
          select jsonb_agg(
            jsonb_build_object('exercise', t.exercise_id)
              || case when r.share_weights then jsonb_build_object('weight_kg', t.weight_kg, 'reps', t.reps) else '{}'::jsonb end
            order by t.logged_at, t.id
          )
          from public.sets t where t.user_id = s.user_id and t.session_id = s.id and not t.deleted
        ), '[]'::jsonb))
        order by s.local_date desc, s.started_at desc, s.id
      )
      from public.sessions s
      where s.user_id = r.user_id and s.finished_at is not null
        and s.local_date >= first_day and s.local_date < next_day
        and exists (select from public.sets t where t.user_id = s.user_id and t.session_id = s.id and not t.deleted)
    ), '[]'::jsonb) end
  ) into result
  from (
    select
      rank() over (order by q.points desc) as position,
      q.user_id, q.display_name, q.avatar_color, q.points, q.share_weights, q.share_sessions
    from (
      select m.user_id, pr.display_name, pr.avatar_color, pr.share_weights, pr.share_sessions,
        coalesce(sum(private.event_points(e.event)), 0) as points
      from public.group_members m
      join public.profiles pr on pr.user_id = m.user_id
      left join public.scoring_events e
        on e.user_id = m.user_id
        and private.event_date(e.event) >= first_day and private.event_date(e.event) < next_day
      where m.group_id = member_profile.group_id
      group by m.user_id, pr.display_name, pr.avatar_color, pr.share_weights, pr.share_sessions
    ) q
  ) r
  where r.user_id = member_profile.member_id;

  return result;
end;
$$;

revoke execute on function public.member_profile(uuid, uuid, text, date) from public, anon;
grant execute on function public.member_profile(uuid, uuid, text, date) to authenticated;

-- Each board row also names its member, so tapping it can open that member's profile.
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
        'user_id', r.user_id,
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
