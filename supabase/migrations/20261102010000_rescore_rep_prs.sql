-- Sets of more than 12 reps can now be rep PRs (#149, RULES_VERSION 3), so every stored Scoring
-- Event is out of date. Marking every user dirty has the retry job recompute them all (ADR 0001:
-- Points are derived data, always recomputable).
insert into private.dirty_users (user_id)
select id from auth.users
on conflict (user_id) do nothing;
