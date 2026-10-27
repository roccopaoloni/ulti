-- RIR (reps in reserve) a lifter logged on a Set, 0 to 4 where 4 means 4 or more. Optional.
alter table public.sets add column rir smallint check (rir between 0 and 4);

-- A lifter's own Increment for an Exercise, replacing its default (spec: Increment defaults).
--
-- Like the user's training, the app reads its own rows and writes none: every write goes through
-- the sync endpoint, and the latest write wins.
create table public.increment_overrides (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null references public.exercises (id),
  increment_kg numeric not null check (increment_kg > 0),
  updated_at timestamptz not null,
  primary key (user_id, exercise_id)
);

alter table public.increment_overrides enable row level security;
revoke all on public.increment_overrides from anon, authenticated;
grant select on public.increment_overrides to authenticated;

create policy "Users read their own Increment overrides" on public.increment_overrides
  for select to authenticated
  using ((select auth.uid()) = user_id);
