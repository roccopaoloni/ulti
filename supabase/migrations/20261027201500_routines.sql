-- A user's Routine: its Sessions (Routine Days) with their Exercises, Sets and Rep Ranges, kept as
-- one document because it is always read and written whole.
--
-- Like the user's training, the app reads its own rows and writes none: every write goes through
-- the sync endpoint, and the latest write wins.
create table public.routines (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  days jsonb not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

alter table public.routines enable row level security;
revoke all on public.routines from anon, authenticated;
grant select on public.routines to authenticated;

create policy "Users read their own Routine" on public.routines
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Which Routine Day a Session was started from; null for an unplanned Session. It decides which
-- Day is next, and nothing else.
alter table public.sessions add column routine_day_id text;
