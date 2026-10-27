-- Period finalization and the crown moment (ADR 0005). A Group's weekly, monthly and yearly results
-- are frozen as soon as the Period has ended in every member's time zone. A Session that syncs
-- later still counts toward Points, Rank and Streak (those read scoring_events), but the board of a
-- frozen Period is read from the frozen rows below, which never change.

-- One row per member per frozen Period. The member's name and colour are copied in, and user_id has
-- no foreign key, so a frozen result outlives the user it names (Account deletion, #30). Season
-- results (#28) get their own table next to this one.
create table public.period_results (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  period text not null check (period in ('week', 'month', 'year')),
  first_day date not null,
  -- The Scoring Mode the Period was scored in.
  mode text not null,
  user_id uuid not null,
  display_name text not null,
  avatar_color text not null,
  points numeric not null,
  position int not null,
  frozen_at timestamptz not null default now(),
  unique (group_id, period, first_day, user_id)
);
create index period_results_user_id_idx on public.period_results (user_id);

-- No policies: only the functions below, which run as the table's owner, read it.
alter table public.period_results enable row level security;
revoke all on public.period_results from anon, authenticated;

-- The newest frozen result each user has already seen as a crown moment. Ids only grow, so
-- anything above it is still to be shown, on whichever phone opens the app first.
create table private.crown_views (
  user_id uuid primary key references auth.users (id) on delete cascade,
  seen_through bigint not null
);
alter table private.crown_views enable row level security;

-- A Period's standings as the board scores them: every current member, their points under the
-- Mode, and their position (ties share one).
create function private.live_standings(group_id uuid, first_day date, next_day date, mode text)
returns table (user_id uuid, display_name text, avatar_color text, points numeric, "position" bigint)
language sql stable set search_path = '' as $$
  select s.user_id, s.display_name, s.avatar_color, s.points, rank() over (order by s.points desc)
  from (
    select m.user_id, pr.display_name, pr.avatar_color, coalesce(sum(private.event_mode_points(e.event, live_standings.mode)), 0) as points
    from public.group_members m
    join public.profiles pr on pr.user_id = m.user_id
    left join public.scoring_events e
      on e.user_id = m.user_id
      and private.event_date(e.event) >= live_standings.first_day and private.event_date(e.event) < live_standings.next_day
    where m.group_id = live_standings.group_id
    group by m.user_id, pr.display_name, pr.avatar_color
  ) s
$$;

-- What a board shows: the frozen standings once the Period is frozen, the live ones until then.
create function private.period_standings(group_id uuid, period text, first_day date, next_day date, mode text)
returns table (user_id uuid, display_name text, avatar_color text, points numeric, "position" bigint)
language sql stable set search_path = '' as $$
  select f.user_id, f.display_name, f.avatar_color, f.points, f.position::bigint
  from public.period_results f
  where f.group_id = period_standings.group_id and f.period = period_standings.period and f.first_day = period_standings.first_day
  union all
  select l.user_id, l.display_name, l.avatar_color, l.points, l."position"
  from private.live_standings(period_standings.group_id, period_standings.first_day, period_standings.next_day, period_standings.mode) l
  where not exists (
    select from public.period_results f
    where f.group_id = period_standings.group_id and f.period = period_standings.period and f.first_day = period_standings.first_day
  )
$$;

-- The moment a Period ends for a member: midnight at the start of the next one, in the time zone
-- of their latest Session (UTC for someone who has none, or whose zone isn't one Postgres knows).
create function private.period_end_for(user_id uuid, next_day date) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare
  zone text := coalesce((
    select s.time_zone from public.sessions s
    where s.user_id = period_end_for.user_id order by s.started_at desc limit 1
  ), 'UTC');
begin
  return period_end_for.next_day::timestamp at time zone zone;
exception when invalid_parameter_value then
  return period_end_for.next_day::timestamp at time zone 'UTC';
end;
$$;

-- Freezes every Period that is due as of the given moment, and returns how many boards it froze.
-- A Period is due for a Group when
--   - it has ended in every member's time zone,
--   - the Group already had a member before it ended (a Group made afterwards has no results for it),
--   - no member has a Session still waiting for its recompute, so one that synced just before the
--     end isn't left out, and
--   - it isn't frozen yet.
-- Only the two latest Periods of each kind are looked at (the one before the current one, and the
-- one before that to ride out a missed run), so starting the job never crowns old history. The
-- latest a Period can end anywhere is 12 hours after midnight UTC (UTC-12), and the earliest 14
-- hours before (UTC+14), so the current Period is the one holding the moment 14 hours from now in UTC.
create function private.finalize_periods(as_of timestamptz) returns integer
language plpgsql set search_path = '' as $$
declare
  due record;
  frozen integer := 0;
  added integer;
begin
  for due in
    select g.id as group_id, k.period, c.first_day, c.next_day,
      case when k.period = 'year' then 'standard' else private.scoring_mode(g.id, c.first_day) end as mode
    from public.groups g
    cross join (values ('week'), ('month'), ('year')) as k(period)
    cross join lateral (
      select
        (date_trunc(k.period, (finalize_periods.as_of at time zone 'UTC') + interval '14 hours') - (back || ' ' || k.period)::interval)::date as first_day,
        (date_trunc(k.period, (finalize_periods.as_of at time zone 'UTC') + interval '14 hours') - ((back - 1) || ' ' || k.period)::interval)::date as next_day
      from generate_series(1, 2) as back
    ) c
    where not exists (
        select from public.period_results f
        where f.group_id = g.id and f.period = k.period and f.first_day = c.first_day
      )
      and exists (
        select from public.group_members m
        where m.group_id = g.id and m.joined_at < c.next_day::timestamp at time zone 'UTC'
      )
      and not exists (
        select from public.group_members m
        where m.group_id = g.id
          and (finalize_periods.as_of < private.period_end_for(m.user_id, c.next_day)
            or exists (select from private.dirty_users d where d.user_id = m.user_id))
      )
  loop
    insert into public.period_results (group_id, period, first_day, mode, user_id, display_name, avatar_color, points, "position", frozen_at)
    select due.group_id, due.period, due.first_day, due.mode, s.user_id, s.display_name, s.avatar_color, s.points, s."position", finalize_periods.as_of
    from private.live_standings(due.group_id, due.first_day, due.next_day, due.mode) s
    on conflict do nothing;
    get diagnostics added = row_count;
    if added > 0 then
      frozen := frozen + 1;
    end if;
  end loop;
  return frozen;
end;
$$;

revoke execute on function private.live_standings(uuid, date, date, text) from public, anon, authenticated;
revoke execute on function private.period_standings(uuid, text, date, date, text) from public, anon, authenticated;
revoke execute on function private.period_end_for(uuid, date) from public, anon, authenticated;
revoke execute on function private.finalize_periods(timestamptz) from public, anon, authenticated;

-- The finalizer runs every five minutes, inside the database: it needs no Edge Function.
select cron.schedule('finalize-periods', '*/5 * * * *', $$ select private.finalize_periods(now()) $$);

-- The crowns the caller has not seen yet, oldest first: a win is a frozen first place with points
-- above zero, and tied winners each have one. shared_with is how many others share it.
create function public.my_crowns() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'group_id', r.group_id,
        'group_name', g.name,
        'period', r.period,
        'first_day', r.first_day,
        'points', r.points,
        'shared_with', (
          select count(*) - 1 from public.period_results w
          where w.group_id = r.group_id and w.period = r.period and w.first_day = r.first_day and w.position = 1 and w.points > 0
        )
      ) order by r.id
    )
    from public.period_results r
    join public.groups g on g.id = r.group_id
    where r.user_id = me and r.position = 1 and r.points > 0
      and r.id > coalesce((select v.seen_through from private.crown_views v where v.user_id = me), 0)
  ), '[]'::jsonb);
end;
$$;

-- Marks the caller's crown, and every one before it, as seen.
create function public.see_crown(crown_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  insert into private.crown_views (user_id, seen_through)
  select me, r.id from public.period_results r where r.id = see_crown.crown_id and r.user_id = me
  on conflict (user_id) do update set seen_through = greatest(private.crown_views.seen_through, excluded.seen_through);
end;
$$;

revoke execute on function public.my_crowns() from public, anon;
grant execute on function public.my_crowns() to authenticated;
revoke execute on function public.see_crown(bigint) from public, anon;
grant execute on function public.see_crown(bigint) to authenticated;

-- group_board() and member_profile() as 20261030020000_board_ranks.sql left them, reading their
-- standings from private.period_standings() instead of working them out in place, so a frozen
-- Period shows its frozen results. Nothing else changed.

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
    from private.period_standings(group_board.group_id, group_board.period, first_day, next_day, mode) r
  ), '[]'::jsonb));
end;
$$;

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
    'tier', private.rank_of(private.season_rank_points(r.user_id, member_profile.on_date)) -> 'tier',
    'division', private.rank_of(private.season_rank_points(r.user_id, member_profile.on_date)) -> 'division',
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
    select q."position", q.user_id, q.display_name, q.avatar_color, q.points, pr.share_weights, pr.share_sessions
    from private.period_standings(member_profile.group_id, member_profile.period, first_day, next_day, mode) q
    join public.profiles pr on pr.user_id = q.user_id
  ) r
  where r.user_id = member_profile.member_id;

  return result;
end;
$$;
