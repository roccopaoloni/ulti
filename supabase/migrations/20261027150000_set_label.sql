-- The lifter's one-tap override of a Set's detected label (spec: Warm-up detection). Null means
-- the rules package detects it; the recompute passes the override on, so the rules stay the only
-- place that decides what is a Warm-up Set.
alter table public.sets add column label text check (label in ('warm-up', 'working'));
