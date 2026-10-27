-- Equipment variants and Custom Exercises (spec: Catalog seed).
--
-- Every equipment variant is its own Exercise, so the catalog says which equipment each one uses.
-- A Custom Exercise is a row in the same table that belongs to one user: Sets point at either kind
-- the same way. Only the sync endpoint writes them, with the IDs the phone made.
alter table public.exercises
  add column equipment text check (equipment in ('barbell', 'dumbbell', 'machine', 'cable', 'smith', 'bodyweight')),
  -- Null for the shared catalog, the owner for a Custom Exercise. Custom Exercises are marked by
  -- this so the rules package can leave them out of Progress Points and recommendations.
  add column owner_id uuid references auth.users (id) on delete cascade,
  add constraint custom_exercise_id check (owner_id is null or id like 'custom-%');

-- The 14 Benchmark Lifts already shipped: the bodyweight ones use no equipment, the rest a barbell.
update public.exercises
set equipment = case when type = 'bodyweight' then 'bodyweight' else 'barbell' end;

alter table public.exercises
  add constraint catalog_exercise_has_equipment check (owner_id is not null or equipment is not null);

drop policy "Signed-in users read the catalog" on public.exercises;
create policy "Signed-in users read the catalog and their own Custom Exercises" on public.exercises
  for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
