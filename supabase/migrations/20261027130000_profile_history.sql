-- The dated histories of sex, bodyweight and Weekly Target (ADR 0002), and the units a user reads
-- weights in.
--
-- Like the user's training, the app reads its own rows and writes none: every write goes through
-- the sync endpoint. Sex and bodyweight are never shown to anyone, so the only policy lets a user
-- read their own rows, and Groups have no function that reaches this table.
--
-- Each entry holds from its local date until the next one starts. A date has one entry, so a
-- correction replaces it, and the latest write wins.
create table public.profile_history (
  user_id uuid not null references auth.users (id) on delete cascade,
  field text not null check (field in ('sex', 'bodyweightKg', 'weeklyTarget')),
  effective_from date not null,
  -- 'male' | 'female' | 'unspecified', kg, or a count of Sessions: the sync endpoint checks which.
  value jsonb not null,
  updated_at timestamptz not null,
  primary key (user_id, field, effective_from)
);

alter table public.profile_history enable row level security;
revoke all on public.profile_history from anon, authenticated;
grant select on public.profile_history to authenticated;

create policy "Users read their own profile history" on public.profile_history
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Weights are stored in kg and shown in these units. Not dated: it changes how weights are shown,
-- never what they are.
alter table public.profiles add column units text check (units in ('kg', 'lb'));
