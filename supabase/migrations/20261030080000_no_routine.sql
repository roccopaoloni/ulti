-- "I don't follow a routine": a lifter who trains without a Routine says so once, and the app stops
-- offering to set one up. It is a yes or no that holds until changed, not a dated history (ADR 0002
-- is for values that score), so it is a column of the user's own settings row, where the units
-- already are. It follows the user to a new phone.
--
-- The app reads it, and writes it through the sync endpoint like the rest of the user's data.
-- The latest write wins, and saving a Routine clears it: no_routine_at is when the phone made the
-- write, so a Routine written before the choice does not undo it.
alter table public.profiles
  add column no_routine boolean not null default false,
  add column no_routine_at timestamptz;
