-- Group news for Home: which other members already trained today, and who passed whom in the
-- week since the caller's last visit. Like group_board(), it reads scoring_events on the caller's
-- behalf and returns only what every member always shows: display name, avatar colour, and a
-- position change that comes from Standard Points. No points, weights, reps or dates leave here.

-- The caller's today is on_date. A member trained today when a qualifying Session of theirs has
-- that local date, which a week's Consistency event lists in sessionDates (so a Session beyond the
-- Weekly Target is not listed).
--
-- Scoring Events carry local dates and no clock times, so "since the last visit" is a local date:
-- since is the day of the last visit, and what happened on that day counts as already seen. The
-- passes compare the standings of the week of on_date as they were at the end of since with the
-- standings now. Someone passed someone when they were behind and are now strictly ahead. A last
-- visit before the week began compares against the empty start of the week, where everyone is tied
-- and so nobody was passed.
create function public.group_news(group_id uuid, since date, on_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  this_week date := date_trunc('week', group_news.on_date::timestamp)::date;
begin
  if not exists (select from public.group_members m where m.group_id = group_news.group_id and m.user_id = me) then
    raise exception 'not_member';
  end if;

  return jsonb_build_object(
    'trained_today', coalesce((
      select jsonb_agg(
        jsonb_build_object('display_name', pr.display_name, 'avatar_color', pr.avatar_color)
        order by pr.display_name, m.user_id
      )
      from public.group_members m
      join public.profiles pr on pr.user_id = m.user_id
      where m.group_id = group_news.group_id and m.user_id <> me
        and exists (
          select from public.scoring_events e
          where e.user_id = m.user_id and e.event ->> 'kind' = 'consistency' and (e.event ->> 'week')::date = this_week
            and e.event -> 'sessionDates' @> to_jsonb(group_news.on_date::text)
        )
    ), '[]'::jsonb),
    'passes', coalesce((
      with standings as (
        select s.user_id, s.display_name,
          rank() over (order by s.then_points desc) as then_position,
          rank() over (order by s.now_points desc) as now_position
        from (
          select m.user_id, pr.display_name,
            coalesce(sum(private.event_points(e.event)), 0) as now_points,
            -- At the end of since: Personal Records dated by then, and the share of the week's
            -- Consistency Points that its Sessions up to then are worth.
            coalesce(sum(
              case when e.event ->> 'kind' = 'personal-record' then
                case when private.event_date(e.event) <= group_news.since then private.event_points(e.event) else 0 end
              else
                private.event_points(e.event)
                  * (select count(*) from jsonb_array_elements_text(e.event -> 'sessionDates') d where d::date <= group_news.since)
                  / greatest(jsonb_array_length(e.event -> 'sessionDates'), 1)
              end
            ), 0) as then_points
          from public.group_members m
          join public.profiles pr on pr.user_id = m.user_id
          left join public.scoring_events e
            on e.user_id = m.user_id
            and private.event_date(e.event) >= this_week and private.event_date(e.event) < this_week + 7
          where m.group_id = group_news.group_id
          group by m.user_id, pr.display_name
        ) s
      )
      select jsonb_agg(
        jsonb_build_object(
          'passer', jsonb_build_object('display_name', a.display_name, 'me', a.user_id = me),
          'passed', jsonb_build_object('display_name', b.display_name, 'me', b.user_id = me)
        )
        order by a.now_position, b.now_position, a.user_id, b.user_id
      )
      from standings a
      join standings b on a.then_position > b.then_position and a.now_position < b.now_position
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.group_news(uuid, date, date) from public, anon;
grant execute on function public.group_news(uuid, date, date) to authenticated;
