-- A jump bigger than a month of training produces is no longer scored (#148, RULES_VERSION 5), so
-- every stored Scoring Event is out of date. Marking every user dirty has the retry job recompute
-- them all.
insert into private.dirty_users (user_id)
select id from auth.users
on conflict (user_id) do nothing;
