-- The Tutorial is shown once per account, the first time the lifter reaches Home after setup. Whether
-- it was seen is a yes or no that only ever turns to yes (Replay runs it again without unsetting
-- anything), so it is a column of the user's own settings row, like the units. It follows the user
-- to a new phone, and the app writes it through the sync endpoint.
--
-- Every account that exists now was onboarded before the Tutorial, so it reads as seen: a row is made
-- for the accounts that have none yet. Accounts made later start unseen.
alter table public.profiles
  add column tutorial_seen boolean not null default false;

insert into public.profiles (user_id, tutorial_seen)
select id, true from auth.users
on conflict (user_id) do update set tutorial_seen = true;
