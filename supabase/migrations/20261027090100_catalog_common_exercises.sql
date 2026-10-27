-- About 50 common gym exercises beside the 14 Benchmark Lifts, in their main equipment variants.
-- Every variant is its own Exercise, so switching equipment never creates a fake record.
--
-- Increments by equipment (spec): about +5 kg for barbell lower-body lifts, +2.5 kg for barbell
-- upper-body lifts, the next dumbbell (2.5 kg), and one plate on a machine stack (5 kg). A cable
-- stack moves in smaller steps (2.5 kg), and the Smith machine follows the barbell it replaces.
insert into public.exercises (id, name_en, name_es, type, equipment, is_benchmark_lift, default_increment_kg) values
  ('romanian-deadlift', 'Romanian deadlift', 'Peso muerto rumano', 'weighted', 'barbell', false, 5),
  ('barbell-row', 'Barbell row', 'Remo con barra', 'weighted', 'barbell', false, 2.5),
  ('barbell-hip-thrust', 'Barbell hip thrust', 'Hip thrust con barra', 'weighted', 'barbell', false, 5),
  ('barbell-curl', 'Barbell curl', 'Curl con barra', 'weighted', 'barbell', false, 2.5),
  ('close-grip-bench-press', 'Close-grip bench press', 'Press banca agarre cerrado', 'weighted', 'barbell', false, 2.5),
  ('decline-bench-press', 'Decline bench press', 'Press banca declinado', 'weighted', 'barbell', false, 2.5),
  ('barbell-lunge', 'Barbell lunge', 'Zancada con barra', 'weighted', 'barbell', false, 5),
  ('good-morning', 'Good morning', 'Buenos días', 'weighted', 'barbell', false, 5),
  ('barbell-shrug', 'Barbell shrug', 'Encogimientos con barra', 'weighted', 'barbell', false, 2.5),
  ('skull-crusher', 'Skull crusher', 'Press francés con barra', 'weighted', 'barbell', false, 2.5),

  ('dumbbell-bench-press', 'Dumbbell bench press', 'Press banca con mancuernas', 'weighted', 'dumbbell', false, 2.5),
  ('dumbbell-incline-bench-press', 'Dumbbell incline bench press', 'Press banca inclinado con mancuernas', 'weighted', 'dumbbell', false, 2.5),
  ('dumbbell-shoulder-press', 'Dumbbell shoulder press', 'Press de hombros con mancuernas', 'weighted', 'dumbbell', false, 2.5),
  ('dumbbell-row', 'Dumbbell row', 'Remo con mancuerna', 'weighted', 'dumbbell', false, 2.5),
  ('dumbbell-curl', 'Dumbbell curl', 'Curl con mancuernas', 'weighted', 'dumbbell', false, 2.5),
  ('hammer-curl', 'Hammer curl', 'Curl martillo', 'weighted', 'dumbbell', false, 2.5),
  ('dumbbell-lateral-raise', 'Dumbbell lateral raise', 'Elevaciones laterales con mancuernas', 'weighted', 'dumbbell', false, 2.5),
  ('dumbbell-fly', 'Dumbbell fly', 'Aperturas con mancuernas', 'weighted', 'dumbbell', false, 2.5),
  ('dumbbell-romanian-deadlift', 'Dumbbell Romanian deadlift', 'Peso muerto rumano con mancuernas', 'weighted', 'dumbbell', false, 2.5),
  ('dumbbell-lunge', 'Dumbbell lunge', 'Zancada con mancuernas', 'weighted', 'dumbbell', false, 2.5),
  ('goblet-squat', 'Goblet squat', 'Sentadilla goblet', 'weighted', 'dumbbell', false, 2.5),
  ('bulgarian-split-squat', 'Bulgarian split squat', 'Sentadilla búlgara', 'weighted', 'dumbbell', false, 2.5),
  ('dumbbell-shrug', 'Dumbbell shrug', 'Encogimientos con mancuernas', 'weighted', 'dumbbell', false, 2.5),

  ('leg-press', 'Leg press', 'Prensa de piernas', 'weighted', 'machine', false, 5),
  ('leg-extension', 'Leg extension', 'Extensión de cuádriceps', 'weighted', 'machine', false, 5),
  ('lying-leg-curl', 'Lying leg curl', 'Curl femoral acostado', 'weighted', 'machine', false, 5),
  ('seated-leg-curl', 'Seated leg curl', 'Curl femoral sentado', 'weighted', 'machine', false, 5),
  ('standing-calf-raise', 'Standing calf raise', 'Elevación de gemelos de pie', 'weighted', 'machine', false, 5),
  ('seated-calf-raise', 'Seated calf raise', 'Elevación de gemelos sentado', 'weighted', 'machine', false, 5),
  ('machine-chest-press', 'Machine chest press', 'Press de pecho en máquina', 'weighted', 'machine', false, 5),
  ('machine-shoulder-press', 'Machine shoulder press', 'Press de hombros en máquina', 'weighted', 'machine', false, 5),
  ('pec-deck', 'Pec deck', 'Aperturas en máquina (pec deck)', 'weighted', 'machine', false, 5),
  ('machine-row', 'Machine row', 'Remo en máquina', 'weighted', 'machine', false, 5),
  ('hack-squat', 'Hack squat', 'Sentadilla hack', 'weighted', 'machine', false, 5),

  ('smith-machine-squat', 'Smith machine squat', 'Sentadilla en multipower', 'weighted', 'smith', false, 5),
  ('smith-machine-bench-press', 'Smith machine bench press', 'Press banca en multipower', 'weighted', 'smith', false, 2.5),
  ('smith-machine-shoulder-press', 'Smith machine shoulder press', 'Press de hombros en multipower', 'weighted', 'smith', false, 2.5),

  ('lat-pulldown', 'Lat pulldown', 'Jalón al pecho', 'weighted', 'cable', false, 2.5),
  ('seated-cable-row', 'Seated cable row', 'Remo en polea baja', 'weighted', 'cable', false, 2.5),
  ('cable-triceps-pushdown', 'Cable triceps pushdown', 'Extensión de tríceps en polea', 'weighted', 'cable', false, 2.5),
  ('cable-curl', 'Cable curl', 'Curl en polea', 'weighted', 'cable', false, 2.5),
  ('cable-fly', 'Cable fly', 'Aperturas en polea', 'weighted', 'cable', false, 2.5),
  ('face-pull', 'Face pull', 'Face pull', 'weighted', 'cable', false, 2.5),
  ('cable-lateral-raise', 'Cable lateral raise', 'Elevaciones laterales en polea', 'weighted', 'cable', false, 2.5),
  ('cable-crunch', 'Cable crunch', 'Abdominales en polea', 'weighted', 'cable', false, 2.5),
  ('cable-overhead-triceps-extension', 'Cable overhead triceps extension', 'Extensión de tríceps sobre la cabeza en polea', 'weighted', 'cable', false, 2.5),

  ('push-up', 'Push-up', 'Flexiones de brazos', 'bodyweight', 'bodyweight', false, 2.5),
  ('hanging-leg-raise', 'Hanging leg raise', 'Elevación de piernas colgado', 'bodyweight', 'bodyweight', false, 2.5),
  ('inverted-row', 'Inverted row', 'Remo invertido', 'bodyweight', 'bodyweight', false, 2.5)
on conflict (id) do update set
  name_en = excluded.name_en,
  name_es = excluded.name_es,
  type = excluded.type,
  equipment = excluded.equipment,
  is_benchmark_lift = excluded.is_benchmark_lift,
  default_increment_kg = excluded.default_increment_kg;
