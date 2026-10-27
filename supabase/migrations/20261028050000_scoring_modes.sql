-- Scoring Modes (ADR 0001): the Owner picks how a Group's weekly and monthly boards score the same
-- Scoring Events. Each event stores one points value per Mode, so a board stays a plain sum.

-- A Group's Mode history: the Mode chosen on a local date. A board's Period uses the latest Mode
-- chosen before the Period began, so a change applies from the next week or the next month and never
-- rewrites a board that has started. Choosing again on the same date replaces that date's choice.
create table public.group_scoring_modes (
  group_id uuid not null references public.groups (id) on delete cascade,
  changed_on date not null,
  mode text not null check (mode in ('standard', 'prHunt', 'grind')),
  primary key (group_id, changed_on)
);
-- No policies: only the functions below, which run as the table's owner, read or change it.
alter table public.group_scoring_modes enable row level security;
revoke all on public.group_scoring_modes from anon, authenticated;

-- The Mode a Group's board uses for the Period that begins on first_day. The yearly board is always
-- Standard, so it never asks.
create function private.scoring_mode(group_id uuid, first_day date) returns text
language sql stable set search_path = '' as $$
  select coalesce((
    select m.mode from public.group_scoring_modes m
    where m.group_id = scoring_mode.group_id and m.changed_on < scoring_mode.first_day
    order by m.changed_on desc limit 1
  ), 'standard')
$$;

-- What a Scoring Event is worth under a Mode. Events stored before Modes existed carry no
-- per-Mode points until their next recompute, so they are worked out from their two kinds of Points.
create function private.event_mode_points(event jsonb, mode text) returns numeric
language sql immutable set search_path = '' as $$
  select coalesce(
    (event -> 'points' ->> mode)::numeric,
    case mode
      when 'prHunt' then coalesce((event ->> 'progressPoints')::numeric, 0)
      when 'grind' then coalesce((event ->> 'consistencyPoints')::numeric, 0)
      else private.event_points(event)
    end
  )
$$;

revoke execute on function private.scoring_mode(uuid, date), private.event_mode_points(jsonb, text) from public, anon, authenticated;

-- The Owner chooses the Mode ('standard', 'prHunt' or 'grind') on the caller's local date on_date.
-- It applies from the next week on the weekly board and the next month on the monthly one.
create function public.set_scoring_mode(group_id uuid, mode text, on_date date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.group_owner(set_scoring_mode.group_id) is distinct from (select auth.uid()) then
    raise exception 'not_owner';
  end if;
  if set_scoring_mode.mode not in ('standard', 'prHunt', 'grind') then
    raise exception 'invalid_mode';
  end if;
  insert into public.group_scoring_modes (group_id, changed_on, mode)
  values (set_scoring_mode.group_id, set_scoring_mode.on_date, set_scoring_mode.mode)
  on conflict (group_id, changed_on) do update set mode = excluded.mode;
end;
$$;

revoke execute on function public.set_scoring_mode(uuid, text, date) from public, anon;
grant execute on function public.set_scoring_mode(uuid, text, date) to authenticated;

-- group_board() again, now scoring the weekly and monthly boards with the Group's Mode for their
-- Period and naming it ('scoring_mode', with the 'next_scoring_mode' the Owner chose last, which
-- differs while a change is waiting). Everything else it returns is as before.
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
        select m.user_id, pr.display_name, pr.avatar_color, coalesce(sum(private.event_mode_points(e.event, mode)), 0) as points
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

-- member_profile() mirrors the board of the same Period, so it scores with the same Mode.
create or replace function public.member_profile(group_id uuid, member_id uuid, period text, on_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  first_day date;
  next_day date;
  result jsonb;
  mode text;
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
  mode := case when member_profile.period = 'year' then 'standard' else private.scoring_mode(member_profile.group_id, first_day) end;

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
        coalesce(sum(private.event_mode_points(e.event, mode)), 0) as points
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
