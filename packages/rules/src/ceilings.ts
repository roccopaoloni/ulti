// The ceiling of every catalog Exercise (spec: Implausible Sets): the e1RM in kg beyond which a Set
// is treated as a typo. For a bodyweight Exercise it is the total load, the lifter's bodyweight plus
// the added weight. A number is either the Exercise's all-time record (equipped lifts included)
// rounded up, or, where no record exists or it isn't tracked, a deliberately generous hand-picked
// figure marked "hand-picked". Records are quoted from memory of the public record lists, not
// re-fetched, and every number is rounded up so a real record never trips the check.
// Dumbbell Exercises are per dumbbell, as the app logs them.

export type Ceiling = { kg: number; source: string };

const record = (kg: number, source: string): Ceiling => ({ kg, source });
const picked = (kg: number, why: string): Ceiling => ({ kg, source: `hand-picked: ${why}` });

export const CEILINGS: Record<string, Ceiling> = {
  // Benchmark Lifts
  'back-squat': record(600, 'all-time equipped squat about 575 kg (raw about 490 kg)'),
  'bench-press': record(520, 'all-time equipped bench press about 500 kg (raw about 355 kg)'),
  deadlift: record(520, 'all-time deadlift 501 kg (raw, strongman); equipped about 460 kg'),
  'front-squat': record(350, 'heaviest front squats on record about 320 kg'),
  'sumo-deadlift': record(520, 'same as the deadlift: sumo records equal the all-time 501 kg'),
  'power-clean': record(280, 'heaviest clean in weightlifting 267 kg (Talakhadze, clean and jerk)'),
  'incline-bench-press': picked(400, 'no tracked record; raw inclines top out near 300 kg'),
  'overhead-press': record(250, 'heaviest strict press about 225 kg'),
  'push-press': record(300, 'near the 267 kg all-time clean and jerk'),
  'snatch-press': picked(200, 'no tracked record'),
  dip: record(450, 'weighted dip about 270 kg total; room left for many reps at bodyweight'),
  'chin-up': record(450, 'weighted chin-up about 250 kg total; room left for many reps at bodyweight'),
  'pull-up': record(450, 'weighted pull-up about 280 kg total; room left for many reps at bodyweight'),
  'pendlay-row': picked(300, 'no tracked record; heaviest barbell rows about 270 kg'),

  // Barbell
  'romanian-deadlift': picked(450, 'no tracked record; below the deadlift record'),
  'barbell-row': picked(300, 'no tracked record; heaviest barbell rows about 270 kg'),
  'barbell-hip-thrust': picked(700, 'reported hip thrusts reach about 500 kg'),
  'barbell-curl': picked(150, 'strict barbell curl record about 100 kg'),
  'close-grip-bench-press': picked(450, 'below the 500 kg equipped bench record'),
  'decline-bench-press': picked(500, 'no tracked record; near the equipped bench record'),
  'barbell-lunge': picked(350, 'no tracked record; below the squat record'),
  'good-morning': picked(450, 'reported good mornings about 360 kg'),
  'barbell-shrug': picked(600, 'reported barbell shrugs above 500 kg'),
  'skull-crusher': picked(200, 'no tracked record'),

  // Dumbbell, per dumbbell
  'dumbbell-bench-press': picked(130, 'heaviest dumbbells made are about 100 kg a side'),
  'dumbbell-incline-bench-press': picked(120, 'heaviest dumbbells made are about 100 kg a side'),
  'dumbbell-shoulder-press': picked(110, 'heaviest dumbbells made are about 100 kg a side'),
  'dumbbell-row': picked(130, 'heaviest dumbbells made are about 100 kg a side'),
  'dumbbell-curl': picked(80, 'strict dumbbell curl record about 60 kg'),
  'hammer-curl': picked(80, 'strict dumbbell curl record about 60 kg'),
  'dumbbell-lateral-raise': picked(50, 'heaviest lateral raises on record about 40 kg'),
  'dumbbell-fly': picked(80, 'no tracked record'),
  'dumbbell-romanian-deadlift': picked(150, 'heaviest dumbbells made are about 100 kg a side'),
  'dumbbell-lunge': picked(120, 'heaviest dumbbells made are about 100 kg a side'),
  'goblet-squat': picked(100, 'heaviest dumbbells made are about 100 kg'),
  'bulgarian-split-squat': picked(150, 'heaviest dumbbells made are about 100 kg a side'),
  'dumbbell-shrug': picked(200, 'heaviest dumbbells made are about 100 kg a side'),

  // Machines vary by plate count and lever ratio, so these are generous
  'leg-press': picked(2500, 'plate-loaded machines vary; reported leg presses reach 2,000 kg'),
  'leg-extension': picked(400, 'no tracked record'),
  'lying-leg-curl': picked(300, 'no tracked record'),
  'seated-leg-curl': picked(300, 'no tracked record'),
  'standing-calf-raise': picked(800, 'no tracked record; reported calf raises reach 600 kg'),
  'seated-calf-raise': picked(500, 'no tracked record'),
  'machine-chest-press': picked(400, 'no tracked record'),
  'machine-shoulder-press': picked(350, 'no tracked record'),
  'pec-deck': picked(300, 'no tracked record'),
  'machine-row': picked(400, 'no tracked record'),
  'hack-squat': picked(800, 'no tracked record; reported hack squats about 600 kg'),

  // Smith machine
  'smith-machine-squat': picked(700, 'no tracked record; bar is counterbalanced, above the squat record'),
  'smith-machine-bench-press': picked(600, 'no tracked record; above the equipped bench record'),
  'smith-machine-shoulder-press': picked(350, 'no tracked record'),

  // Cable
  'lat-pulldown': picked(300, 'no tracked record; stacks end near 150 kg'),
  'seated-cable-row': picked(300, 'no tracked record; stacks end near 150 kg'),
  'cable-triceps-pushdown': picked(200, 'no tracked record; stacks end near 100 kg'),
  'cable-curl': picked(150, 'no tracked record; stacks end near 100 kg'),
  'cable-fly': picked(150, 'no tracked record; stacks end near 100 kg'),
  'face-pull': picked(150, 'no tracked record; stacks end near 100 kg'),
  'cable-lateral-raise': picked(60, 'no tracked record'),
  'cable-crunch': picked(250, 'no tracked record'),
  'cable-overhead-triceps-extension': picked(150, 'no tracked record; stacks end near 100 kg'),

  // Bodyweight, total load: room for 100+ reps at bodyweight, which people do
  'push-up': picked(500, 'no tracked record; push-up reps records are in the thousands'),
  'hanging-leg-raise': picked(500, 'no tracked record'),
  'inverted-row': picked(500, 'no tracked record'),
};
