-- Sets beyond an Exercise's ceiling are no longer scored (#147, RULES_VERSION 3), so every stored
-- Scoring Event is out of date. Marking every user dirty has the retry job recompute them all.
insert into private.dirty_users (user_id)
select id from auth.users
on conflict (user_id) do nothing;
