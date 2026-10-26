-- The Exercise catalog. Every signed-in user reads it, and the app keeps a copy for offline use.
-- Nobody writes it through the API: its rows ship in migrations (see the next one).
create table public.exercises (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_en text not null,
  name_es text not null,
  -- Only weighted and bodyweight Exercises exist in v1 (spec: Catalog seed).
  type text not null check (type in ('weighted', 'bodyweight')),
  is_benchmark_lift boolean not null default false,
  -- The weight a go-heavier recommendation adds by default.
  default_increment_kg numeric not null check (default_increment_kg > 0)
);

alter table public.exercises enable row level security;
revoke all on public.exercises from anon, authenticated;
grant select on public.exercises to authenticated;

create policy "Signed-in users read the catalog" on public.exercises
  for select to authenticated
  using (true);
