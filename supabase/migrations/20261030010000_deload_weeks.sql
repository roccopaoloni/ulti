-- A lifter's Deload Weeks: started by them, or suggested by the app and then accepted or
-- dismissed (spec: Deload Week). The week is the Monday that starts it. An accepted one makes the
-- week's Sessions qualify with three Working Sets, so the recompute reads it.
--
-- Like the user's training, the app reads its own rows and writes none: every write goes through
-- the sync endpoint, and the latest write for a week wins.
create table public.deload_weeks (
  user_id uuid not null references auth.users (id) on delete cascade,
  week date not null check (extract(isodow from week) = 1),
  origin text not null check (origin in ('suggested', 'self')),
  -- Why the app suggested it; none for a Deload Week the lifter started.
  reason text check (reason in ('stalled', 'rir', 'time')),
  status text not null check (status in ('accepted', 'dismissed')),
  updated_at timestamptz not null,
  primary key (user_id, week)
);

alter table public.deload_weeks enable row level security;
revoke all on public.deload_weeks from anon, authenticated;
grant select on public.deload_weeks to authenticated;

create policy "Users read their own Deload Weeks" on public.deload_weeks
  for select to authenticated
  using ((select auth.uid()) = user_id);
