-- Season finalization and the soft reset (ADR 0005, spec: Rank). A Season is a calendar quarter. Its
-- final Rank freezes 72 hours after it ends in the user's time zone, so a Session synced up to then
-- still counts, and the next Season starts at the bottom of the Tier below the one they finished in.

-- One row per user per frozen Season. user_id has no foreign key, as in period_results, so Account
-- deletion (#30) decides what happens to a row; nothing here cascades from the user.
create table public.season_results (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  -- The Season's first day, which is also what names it ('2025-Q1').
  first_day date not null,
  -- The Season Rank Points the user finished with, starting points included, and the Rank they are.
  points numeric not null,
  tier text not null,
  division int,
  -- Where the next Season starts, from the Tier above (private.starting_points_after).
  next_starting_points numeric not null,
  frozen_at timestamptz not null default now(),
  unique (user_id, first_day)
);

-- No policies: only the functions below, which run as the table's owner, read it.
alter table public.season_results enable row level security;
revoke all on public.season_results from anon, authenticated;

-- The Season Rank Points a user starts a Season with when the Season before it was finished in the
-- given Tier. This mirrors startingPointsAfter in rank.ts of the rules package (the cutoff of
-- Division V of the Tier below, and a Bronze finish starts at 0); keep the two in step.
create function private.starting_points_after(tier text) returns numeric
language sql immutable set search_path = '' as $$
  select case starting_points_after.tier when 'elite' then 2300 when 'diamond' then 1300 when 'gold' then 800 else 0 end
$$;

-- The Points a user earned in the Season holding a date, as season_standing() counts them.
create function private.season_earned_points(user_id uuid, on_date date) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(sum(private.event_points(e.event)), 0)
  from public.scoring_events e
  where e.user_id = season_earned_points.user_id
    and private.event_date(e.event) >= date_trunc('quarter', season_earned_points.on_date)::date
    and private.event_date(e.event) < (date_trunc('quarter', season_earned_points.on_date) + interval '3 months')::date
$$;

-- Where a user's Season (the one holding on_date) starts. Once the Season before is frozen, that is
-- its frozen number. During the 72-hour grace it isn't frozen yet, so it is what the number would
-- be if it froze now: the Season before's Rank so far, one level down. The new Season therefore
-- shows its final starting Rank from its first day, and a late Session can only raise it.
create function private.starting_points(user_id uuid, on_date date) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(
    (select r.next_starting_points from public.season_results r
      where r.user_id = starting_points.user_id and r.first_day = date_trunc('quarter', starting_points.on_date)::date - interval '3 months'),
    private.starting_points_after(
      private.rank_of(
        coalesce((select r.next_starting_points from public.season_results r
          where r.user_id = starting_points.user_id and r.first_day = date_trunc('quarter', starting_points.on_date)::date - interval '6 months'), 0)
        + private.season_earned_points(starting_points.user_id, (date_trunc('quarter', starting_points.on_date) - interval '1 day')::date)
      ) ->> 'tier'
    )
  )
$$;

-- The Season Rank Points a user holds in the Season holding a date: the frozen number once the Season
-- is frozen, otherwise the starting points plus the Points earned in it.
create or replace function private.season_rank_points(user_id uuid, on_date date) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(
    (select r.points from public.season_results r
      where r.user_id = season_rank_points.user_id and r.first_day = date_trunc('quarter', season_rank_points.on_date)::date),
    private.starting_points(season_rank_points.user_id, season_rank_points.on_date)
      + private.season_earned_points(season_rank_points.user_id, season_rank_points.on_date)
  )
$$;

revoke execute on function private.starting_points_after(text) from public, anon, authenticated;
revoke execute on function private.season_earned_points(uuid, date) from public, anon, authenticated;
revoke execute on function private.starting_points(uuid, date) from public, anon, authenticated;

-- season_standing() as 20261028020000_season_standing.sql made it. The caller's own Points now
-- include their starting points (and are the frozen number for a frozen Season), and position and
-- "top X%" rank the lifters with Points earned in the Season by those Season Rank Points. Starting
-- points alone don't make a lifter, so one who hasn't trained has neither. Position and "top X%"
-- are read live: they are only meant for the current Season.
create or replace function public.season_standing(on_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  season_start date := date_trunc('quarter', season_standing.on_date)::date;
  season_end date := (date_trunc('quarter', season_standing.on_date) + interval '3 months')::date - 1;
  my_points numeric;
  standing record;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  my_points := private.season_rank_points(me, season_standing.on_date);
  with season_points as (
    select e.user_id, sum(
      case e.event ->> 'kind'
        when 'consistency' then (e.event ->> 'consistencyPoints')::numeric
        when 'personal-record' then (e.event ->> 'progressPoints')::numeric
      end
    ) as earned
    from public.scoring_events e
    where (case e.event ->> 'kind' when 'consistency' then e.event ->> 'week' else e.event ->> 'localDate' end)::date
      between season_start and season_end
    group by e.user_id
    having sum(
      case e.event ->> 'kind'
        when 'consistency' then (e.event ->> 'consistencyPoints')::numeric
        when 'personal-record' then (e.event ->> 'progressPoints')::numeric
      end
    ) > 0
  ), totals as (
    select p.user_id, private.starting_points(p.user_id, season_standing.on_date) + p.earned as points from season_points p
  )
  select
    (select count(*) from totals t where t.points > my_points) + 1 as rank_position,
    ceil(100.0 * (select count(*) from totals t where t.points >= my_points) / nullif((select count(*) from totals), 0)) as top_percent,
    exists (select from totals t where t.user_id = me) as has_earned
  into standing;
  if not standing.has_earned then
    return jsonb_build_object('points', my_points, 'position', null, 'top_percent', null);
  end if;
  return jsonb_build_object('points', my_points, 'position', standing.rank_position, 'top_percent', standing.top_percent);
end;
$$;

-- Freezes every user's Season that is due as of the given moment, and returns how many results it
-- froze. A user's Season is due 72 hours after it ended in their time zone (the one of their latest
-- Session, as for a Period), unless a Session of theirs is still waiting for its recompute, so one
-- synced inside the grace isn't left out. It covers everyone who earned Points in the Season or
-- started it with some, and skips a Season that is frozen already. As with Periods, only the two
-- latest Seasons are looked at, oldest first, because a Season starts from the one before it.
create function private.finalize_seasons(as_of timestamptz) returns integer
language plpgsql set search_path = '' as $$
declare
  season_start date;
  frozen integer := 0;
  added integer;
begin
  for season_start in
    select (date_trunc('quarter', finalize_seasons.as_of at time zone 'UTC') - (back * 3 || ' months')::interval)::date
    from generate_series(2, 1, -1) as back
  loop
    insert into public.season_results (user_id, first_day, points, tier, division, next_starting_points, frozen_at)
    select u.user_id, season_start, u.points, r.rank ->> 'tier', (r.rank ->> 'division')::int,
      private.starting_points_after(r.rank ->> 'tier'), finalize_seasons.as_of
    from (
      select c.user_id, private.season_rank_points(c.user_id, season_start) as points
      from (
        select e.user_id from public.scoring_events e
        where private.event_date(e.event) >= season_start and private.event_date(e.event) < (season_start + interval '3 months')::date
        union
        select r.user_id from public.season_results r
        where r.first_day = (season_start - interval '3 months')::date and r.next_starting_points > 0
      ) c
      where finalize_seasons.as_of >= private.period_end_for(c.user_id, (season_start + interval '3 months')::date) + interval '72 hours'
        and not exists (select from private.dirty_users d where d.user_id = c.user_id)
    ) u
    cross join lateral (select private.rank_of(u.points) as rank) r
    on conflict do nothing;
    get diagnostics added = row_count;
    frozen := frozen + added;
  end loop;
  return frozen;
end;
$$;

revoke execute on function private.finalize_seasons(timestamptz) from public, anon, authenticated;

-- The same five-minute job freezes Seasons too, next to the Periods.
select cron.schedule('finalize-periods', '*/5 * * * *', $$ select private.finalize_periods(now()), private.finalize_seasons(now()) $$);

-- The caller's stamps from past Seasons, newest first: the Tier and Division each finished in.
create function public.my_season_stamps() returns jsonb
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
        'season', extract(year from r.first_day)::int || '-Q' || extract(quarter from r.first_day)::int,
        'first_day', r.first_day,
        'tier', r.tier,
        'division', r.division
      ) order by r.first_day desc
    )
    from public.season_results r
    where r.user_id = me
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.my_season_stamps() from public, anon;
grant execute on function public.my_season_stamps() to authenticated;
