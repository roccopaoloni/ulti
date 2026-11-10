-- Every catalog Exercise carries a Movement Pattern, so the Deload Week suggestion can tell a tired
-- press from a tired press-and-hinge. A Custom Exercise has none and counts as isolation, so the
-- column is null for it. Lunges and split squats are squats; hip thrusts and good mornings are
-- hinges; dips are vertical presses; push-ups are horizontal presses; core, carries and calves are
-- isolation.
alter table public.exercises
  add column pattern text check (pattern in ('squat', 'hinge', 'horizontal-press', 'vertical-press', 'horizontal-pull', 'vertical-pull', 'isolation'));

update public.exercises as e
set pattern = m.pattern
from (values
  -- Benchmark Lifts
  ('back-squat', 'squat'),
  ('bench-press', 'horizontal-press'),
  ('deadlift', 'hinge'),
  ('front-squat', 'squat'),
  ('sumo-deadlift', 'hinge'),
  ('power-clean', 'hinge'),
  ('incline-bench-press', 'horizontal-press'),
  ('overhead-press', 'vertical-press'),
  ('push-press', 'vertical-press'),
  ('snatch-press', 'vertical-press'),
  ('dip', 'vertical-press'),
  ('chin-up', 'vertical-pull'),
  ('pull-up', 'vertical-pull'),
  ('pendlay-row', 'horizontal-pull'),
  -- Barbell
  ('romanian-deadlift', 'hinge'),
  ('barbell-row', 'horizontal-pull'),
  ('barbell-hip-thrust', 'hinge'),
  ('barbell-curl', 'isolation'),
  ('close-grip-bench-press', 'horizontal-press'),
  ('decline-bench-press', 'horizontal-press'),
  ('barbell-lunge', 'squat'),
  ('good-morning', 'hinge'),
  ('barbell-shrug', 'isolation'),
  ('skull-crusher', 'isolation'),
  -- Dumbbell
  ('dumbbell-bench-press', 'horizontal-press'),
  ('dumbbell-incline-bench-press', 'horizontal-press'),
  ('dumbbell-shoulder-press', 'vertical-press'),
  ('dumbbell-row', 'horizontal-pull'),
  ('dumbbell-curl', 'isolation'),
  ('hammer-curl', 'isolation'),
  ('dumbbell-lateral-raise', 'isolation'),
  ('dumbbell-fly', 'isolation'),
  ('dumbbell-romanian-deadlift', 'hinge'),
  ('dumbbell-lunge', 'squat'),
  ('goblet-squat', 'squat'),
  ('bulgarian-split-squat', 'squat'),
  ('dumbbell-shrug', 'isolation'),
  -- Machine
  ('leg-press', 'squat'),
  ('leg-extension', 'isolation'),
  ('lying-leg-curl', 'isolation'),
  ('seated-leg-curl', 'isolation'),
  ('standing-calf-raise', 'isolation'),
  ('seated-calf-raise', 'isolation'),
  ('machine-chest-press', 'horizontal-press'),
  ('machine-shoulder-press', 'vertical-press'),
  ('pec-deck', 'isolation'),
  ('machine-row', 'horizontal-pull'),
  ('hack-squat', 'squat'),
  -- Smith machine
  ('smith-machine-squat', 'squat'),
  ('smith-machine-bench-press', 'horizontal-press'),
  ('smith-machine-shoulder-press', 'vertical-press'),
  -- Cable
  ('lat-pulldown', 'vertical-pull'),
  ('seated-cable-row', 'horizontal-pull'),
  ('cable-triceps-pushdown', 'isolation'),
  ('cable-curl', 'isolation'),
  ('cable-fly', 'isolation'),
  ('face-pull', 'isolation'),
  ('cable-lateral-raise', 'isolation'),
  ('cable-crunch', 'isolation'),
  ('cable-overhead-triceps-extension', 'isolation'),
  -- Bodyweight
  ('push-up', 'horizontal-press'),
  ('hanging-leg-raise', 'isolation'),
  ('inverted-row', 'horizontal-pull')
) as m (id, pattern)
where e.id = m.id;

-- A catalog Exercise missing from the list above fails the migration here rather than shipping
-- without a pattern.
alter table public.exercises add constraint catalog_exercise_has_pattern check (owner_id is not null or pattern is not null);
