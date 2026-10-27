-- The scoring constants were tuned (#31, RULES_VERSION 2), so every stored Scoring Event is out of
-- date. Marking every user dirty has the retry job recompute them all, which rewrites the events
-- with the new Points and rules version (ADR 0001: Points are derived data, always recomputable).
insert into private.dirty_users (user_id)
select id from auth.users
on conflict (user_id) do nothing;
