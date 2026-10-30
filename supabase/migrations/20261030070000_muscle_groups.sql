-- Every Exercise is filed under one main muscle, so the picker can filter the catalog by it.
-- Compound lifts go where most lifters would look first (a deadlift under Back, a dip under
-- Triceps); Full body is for lifts that train everything at once, like power cleans.
alter table public.exercises
  add column muscle text check (muscle in ('chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full-body'));

update public.exercises as e
set muscle = m.muscle
from (values
  -- Benchmark Lifts
  ('back-squat', 'quads'),
  ('bench-press', 'chest'),
  ('deadlift', 'back'),
  ('front-squat', 'quads'),
  ('sumo-deadlift', 'back'),
  ('power-clean', 'full-body'),
  ('incline-bench-press', 'chest'),
  ('overhead-press', 'shoulders'),
  ('push-press', 'shoulders'),
  ('snatch-press', 'shoulders'),
  ('dip', 'triceps'),
  ('chin-up', 'back'),
  ('pull-up', 'back'),
  ('pendlay-row', 'back'),
  -- Barbell
  ('romanian-deadlift', 'hamstrings'),
  ('barbell-row', 'back'),
  ('barbell-hip-thrust', 'glutes'),
  ('barbell-curl', 'biceps'),
  ('close-grip-bench-press', 'triceps'),
  ('decline-bench-press', 'chest'),
  ('barbell-lunge', 'quads'),
  ('good-morning', 'hamstrings'),
  ('barbell-shrug', 'shoulders'),
  ('skull-crusher', 'triceps'),
  -- Dumbbell
  ('dumbbell-bench-press', 'chest'),
  ('dumbbell-incline-bench-press', 'chest'),
  ('dumbbell-shoulder-press', 'shoulders'),
  ('dumbbell-row', 'back'),
  ('dumbbell-curl', 'biceps'),
  ('hammer-curl', 'biceps'),
  ('dumbbell-lateral-raise', 'shoulders'),
  ('dumbbell-fly', 'chest'),
  ('dumbbell-romanian-deadlift', 'hamstrings'),
  ('dumbbell-lunge', 'quads'),
  ('goblet-squat', 'quads'),
  ('bulgarian-split-squat', 'quads'),
  ('dumbbell-shrug', 'shoulders'),
  -- Machine
  ('leg-press', 'quads'),
  ('leg-extension', 'quads'),
  ('lying-leg-curl', 'hamstrings'),
  ('seated-leg-curl', 'hamstrings'),
  ('standing-calf-raise', 'calves'),
  ('seated-calf-raise', 'calves'),
  ('machine-chest-press', 'chest'),
  ('machine-shoulder-press', 'shoulders'),
  ('pec-deck', 'chest'),
  ('machine-row', 'back'),
  ('hack-squat', 'quads'),
  -- Smith machine
  ('smith-machine-squat', 'quads'),
  ('smith-machine-bench-press', 'chest'),
  ('smith-machine-shoulder-press', 'shoulders'),
  -- Cable
  ('lat-pulldown', 'back'),
  ('seated-cable-row', 'back'),
  ('cable-triceps-pushdown', 'triceps'),
  ('cable-curl', 'biceps'),
  ('cable-fly', 'chest'),
  ('face-pull', 'shoulders'),
  ('cable-lateral-raise', 'shoulders'),
  ('cable-crunch', 'core'),
  ('cable-overhead-triceps-extension', 'triceps'),
  -- Bodyweight
  ('push-up', 'chest'),
  ('hanging-leg-raise', 'core'),
  ('inverted-row', 'back')
) as m (id, muscle)
where e.id = m.id;

-- Custom Exercises made before muscles existed have none to go by: they are filed under Full body,
-- which the lifter cannot change yet.
update public.exercises set muscle = 'full-body' where owner_id is not null and muscle is null;

-- A catalog Exercise missing from the list above fails the migration here rather than shipping
-- untagged.
alter table public.exercises alter column muscle set not null;
