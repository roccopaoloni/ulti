-- trained_today names each friend by user id too, so Home can show a friend once across Groups.
create or replace function public.group_news(group_id uuid, since date, on_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  this_week date := date_trunc('week', group_news.on_date::timestamp)::date;
  mode text;
begin
  if not exists (select from public.group_members m where m.group_id = group_news.group_id and m.user_id = me) then
    raise exception 'not_member';
  end if;
  mode := private.scoring_mode(group_news.group_id, this_week);

  return jsonb_build_object(
    'trained_today', coalesce((
      select jsonb_agg(
        jsonb_build_object('user_id', m.user_id, 'display_name', pr.display_name, 'avatar_color', pr.avatar_color)
        order by pr.display_name, m.user_id
      )
      from public.group_members m
      join public.profiles pr on pr.user_id = m.user_id
      where m.group_id = group_news.group_id and m.user_id <> me
        and exists (
          select from public.scoring_events e
          where e.user_id = m.user_id and e.event ->> 'kind' = 'consistency' and (e.event ->> 'week')::date = this_week
            and coalesce(e.event -> 'trainedDates', e.event -> 'sessionDates') @> to_jsonb(group_news.on_date::text)
        )
    ), '[]'::jsonb),
    'passes', coalesce((
      with standings as (
        select s.user_id, s.display_name,
          rank() over (order by s.then_points desc) as then_position,
          rank() over (order by s.now_points desc) as now_position
        from (
          select m.user_id, pr.display_name,
            coalesce(sum(private.event_mode_points(e.event, mode)), 0) as now_points,
            -- At the end of since: Personal Records dated by then, and the share of the week's
            -- Consistency Points that its Sessions up to then are worth.
            coalesce(sum(
              case when e.event ->> 'kind' = 'personal-record' then
                case when private.event_date(e.event) <= group_news.since then private.event_mode_points(e.event, mode) else 0 end
              else
                private.event_mode_points(e.event, mode)
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
