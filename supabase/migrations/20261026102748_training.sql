-- Each user's training, as their phone logged it, and the Scoring Events derived from it.
--
-- The app reads its own rows here and writes none: every write goes through the sync Edge
-- Function, which writes only the signed-in user's rows. IDs are made on the phone, so every key
-- starts with user_id: one user's IDs can never reach another user's rows.

create table public.sessions (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  -- The moment it started in UTC, the lifter's IANA time zone and the local date there. Weeks,
  -- months and Seasons group Sessions by local date, never by UTC (spec: Time).
  started_at timestamptz not null,
  time_zone text not null,
  local_date date not null,
  finished_at timestamptz,
  primary key (user_id, id)
);

create table public.sets (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  session_id uuid not null,
  exercise_id text not null references public.exercises (id),
  -- Stored in kg and converted for display.
  weight_kg numeric not null check (weight_kg >= 0),
  reps integer not null check (reps > 0),
  logged_at timestamptz not null,
  primary key (user_id, id),
  foreign key (user_id, session_id) references public.sessions (user_id, id) on delete cascade
);
create index sets_session_idx on public.sets (user_id, session_id);

-- Derived data (ADR 0001): every sync recomputes the user's whole history with the rules package
-- and replaces their events with the result. Each event's ID is deterministic, so a recompute
-- updates the events it derives again.
create table public.scoring_events (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  event jsonb not null,
  primary key (user_id, id)
);

alter table public.sessions enable row level security;
alter table public.sets enable row level security;
alter table public.scoring_events enable row level security;
revoke all on public.sessions, public.sets, public.scoring_events from anon, authenticated;
grant select on public.sessions, public.sets, public.scoring_events to authenticated;

create policy "Users read their own Sessions" on public.sessions
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users read their own Sets" on public.sets
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users read their own Scoring Events" on public.scoring_events
  for select to authenticated
  using ((select auth.uid()) = user_id);
