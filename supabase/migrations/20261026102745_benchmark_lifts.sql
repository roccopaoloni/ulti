-- The 14 Benchmark Lifts, from which Strength Level is measured (ADR 0004).
--
-- Catalog rows ship in migrations, not in seed.sql: `supabase db push` applies migrations to the
-- hosted project but never seed files, so this is how production gets them. Each change to the
-- catalog is a new migration that upserts the rows it adds or changes, as this one does.
--
-- Increments by equipment (spec): about +5 kg for barbell lower-body lifts and +2.5 kg for barbell
-- upper-body lifts. Bodyweight lifts add weight in 2.5 kg plates, and the power clean, a fast
-- technical pull, moves up like the upper-body lifts.
insert into public.exercises (id, name_en, name_es, type, is_benchmark_lift, default_increment_kg) values
  ('back-squat', 'Back squat', 'Sentadilla', 'weighted', true, 5),
  ('bench-press', 'Bench press', 'Press banca', 'weighted', true, 2.5),
  ('deadlift', 'Deadlift', 'Peso muerto', 'weighted', true, 5),
  ('front-squat', 'Front squat', 'Sentadilla frontal', 'weighted', true, 5),
  ('sumo-deadlift', 'Sumo deadlift', 'Peso muerto sumo', 'weighted', true, 5),
  ('power-clean', 'Power clean', 'Cargada de potencia', 'weighted', true, 2.5),
  ('incline-bench-press', 'Incline bench press', 'Press banca inclinado', 'weighted', true, 2.5),
  ('overhead-press', 'Overhead press', 'Press militar', 'weighted', true, 2.5),
  ('push-press', 'Push press', 'Push press', 'weighted', true, 2.5),
  ('snatch-press', 'Snatch press', 'Press con agarre de arranque', 'weighted', true, 2.5),
  ('dip', 'Dip', 'Fondos en paralelas', 'bodyweight', true, 2.5),
  ('chin-up', 'Chin-up', 'Dominadas supinas', 'bodyweight', true, 2.5),
  ('pull-up', 'Pull-up', 'Dominadas', 'bodyweight', true, 2.5),
  ('pendlay-row', 'Pendlay row', 'Remo Pendlay', 'weighted', true, 2.5)
on conflict (id) do update set
  name_en = excluded.name_en,
  name_es = excluded.name_es,
  type = excluded.type,
  is_benchmark_lift = excluded.is_benchmark_lift,
  default_increment_kg = excluded.default_increment_kg;
