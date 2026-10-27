-- The caller's standing in a Season (spec: Rank): their Season Rank Points, their position among
-- the Season's lifters, and the "top X%" that follows. There is no public list, so this is the only
-- way the app sees anything of the Season's other lifters, and what it returns is the caller's own
-- numbers only: no other user's Points or identity ever leave the function.
--
-- It reads every user's Scoring Events, so it runs as the tables' owner. A Season is the calendar
-- quarter holding `on_date` (the caller's local date). A Consistency week belongs to the Season its
-- Monday falls in, a Personal Record to the Season of its local date, as the rules package does.
-- Starting points are 0 until Season finalization (#28) brings them from the last final Rank.
--
-- Only lifters with Points in the Season are counted. Ties share a position, and "top X%" is the
-- share of those lifters with at least the caller's Points, rounded up. A caller with no Points in
-- the Season has neither.
create function public.season_standing(on_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  season_start date := date_trunc('quarter', season_standing.on_date)::date;
  season_end date := (date_trunc('quarter', season_standing.on_date) + interval '3 months')::date - 1;
  standing record;
begin
  if me is null then
    raise exception 'not_signed_in';
  end if;
  with season_points as (
    select e.user_id, sum(
      case e.event ->> 'kind'
        when 'consistency' then (e.event ->> 'consistencyPoints')::numeric
        when 'personal-record' then (e.event ->> 'progressPoints')::numeric
      end
    ) as points
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
  ), mine as (
    select p.points from season_points p where p.user_id = me
  )
  select
    (select m.points from mine m) as points,
    (select count(*) from season_points p where p.points > (select m.points from mine m)) + 1 as rank_position,
    ceil(100.0 * (select count(*) from season_points p where p.points >= (select m.points from mine m))
      / (select count(*) from season_points)) as top_percent
  into standing;
  if standing.points is null then
    return jsonb_build_object('points', 0, 'position', null, 'top_percent', null);
  end if;
  return jsonb_build_object('points', standing.points, 'position', standing.rank_position, 'top_percent', standing.top_percent);
end;
$$;

revoke execute on function public.season_standing(date) from public, anon;
grant execute on function public.season_standing(date) to authenticated;
