// The pictures of the catalog Exercises, from the free-exercise-db dataset (public domain): a
// thumbnail and the start and end frames of each, in `public/exercises/<Exercise ID>/`. Only the
// catalog Exercises with a match have a folder; Custom Exercises and the rest have none.
const withPictures = new Set([
  'back-squat', 'barbell-curl', 'barbell-hip-thrust', 'barbell-lunge', 'barbell-row', 'barbell-shrug', 'bench-press',
  'bulgarian-split-squat', 'cable-crunch', 'cable-curl', 'cable-fly', 'cable-lateral-raise', 'cable-overhead-triceps-extension',
  'cable-triceps-pushdown', 'chin-up', 'close-grip-bench-press', 'deadlift', 'decline-bench-press', 'dip', 'dumbbell-bench-press',
  'dumbbell-curl', 'dumbbell-fly', 'dumbbell-incline-bench-press', 'dumbbell-lateral-raise', 'dumbbell-lunge',
  'dumbbell-romanian-deadlift', 'dumbbell-row', 'dumbbell-shoulder-press', 'dumbbell-shrug', 'face-pull', 'front-squat',
  'goblet-squat', 'good-morning', 'hack-squat', 'hammer-curl', 'hanging-leg-raise', 'incline-bench-press', 'inverted-row',
  'lat-pulldown', 'leg-extension', 'leg-press', 'lying-leg-curl', 'machine-chest-press', 'machine-row', 'machine-shoulder-press',
  'overhead-press', 'pec-deck', 'pendlay-row', 'power-clean', 'pull-up', 'push-press', 'push-up', 'romanian-deadlift',
  'seated-cable-row', 'seated-calf-raise', 'seated-leg-curl', 'skull-crusher', 'smith-machine-bench-press',
  'smith-machine-shoulder-press', 'smith-machine-squat', 'standing-calf-raise', 'sumo-deadlift',
]);

export type ExerciseImages = { thumb: string; frames: [start: string, end: string] };

export function exerciseImages(exerciseId: string): ExerciseImages | null {
  if (!withPictures.has(exerciseId)) return null;
  const folder = `/exercises/${exerciseId}`;
  return { thumb: `${folder}/thumb.webp`, frames: [`${folder}/0.webp`, `${folder}/1.webp`] };
}
