import { expect, test } from 'vitest';
import { canStartDeload, deloadedLastWeek, deloadedWeeks, deloadRows, recommendDeload, type Session, type TrainingHistory } from './index.ts';

const rule = { repMin: 8, repMax: 12, incrementKg: 2.5 };
// The Routine's catalog Exercises, with their Rep Ranges, Increments and Movement Patterns.
const routine = [
  { exercise: 'bench-press', rule, pattern: 'horizontal-press' as const },
  { exercise: 'incline-bench-press', rule, pattern: 'horizontal-press' as const },
  { exercise: 'back-squat', rule, pattern: 'squat' as const },
  { exercise: 'overhead-press', rule, pattern: 'vertical-press' as const },
  { exercise: 'barbell-curl', rule, pattern: 'isolation' as const },
  { exercise: 'custom-dips', rule, pattern: null },
];

// A Session of one Exercise, given as the [weightKg, reps, rir] of each Set (all one weight, so all Working Sets).
function session(localDate: string, exercise: string, sets: [number, number, number?][]): Session {
  return {
    localDate,
    sets: sets.map(([weightKg, reps, rir], i) => ({ id: `${localDate}-${exercise}-${i}`, exercise, custom: false, weightKg, reps, rir })),
  };
}
const history = (sessions: Session[], deloadWeeks: string[] = []): TrainingHistory => ({ userId: 'ana', sessions, weeklyTargets: [], deloadWeeks });

// Fatigue for the Exercise: two Calibration Sessions, a best, then two Sessions 5% under it.
const fatiguedSessions = (exercise: string) => [
  session('2026-08-03', exercise, [[60, 10]]),
  session('2026-08-05', exercise, [[60, 10]]),
  session('2026-09-09', exercise, [[60, 10]]),
  session('2026-09-14', exercise, [[57, 10]]),
  session('2026-09-16', exercise, [[57, 10]]),
];
// A Stall, not Fatigue: flat below the best after the Calibration Sessions.
const stalledSessions = (exercise: string) => [
  session('2026-08-03', exercise, [[60, 10]]),
  session('2026-08-05', exercise, [[60, 10]]),
  session('2026-09-09', exercise, [[60, 9]]),
  session('2026-09-14', exercise, [[60, 9]]),
  session('2026-09-16', exercise, [[60, 9]]),
];
// A progressing lifter, so no trigger fires.
const fine = (exercise: string) => [
  session('2026-08-03', exercise, [[60, 10, 2]]),
  session('2026-09-09', exercise, [[60, 10, 2]]),
  session('2026-09-14', exercise, [[62.5, 10, 2]]),
  session('2026-09-16', exercise, [[65, 10, 2]]),
];

const today = '2026-09-17';
const fatigued = (...exercises: string[]) => history(exercises.flatMap(fatiguedSessions));

test('Fatigue on two different compound Movement Patterns recommends a Deload Week, naming the lifts', () => {
  expect(recommendDeload(fatigued('back-squat', 'bench-press'), today, routine)).toEqual({ reason: 'fatigue', exercises: ['bench-press', 'back-squat'] });
});

test('two Fatigued Exercises of the same pattern are one pattern, which is not enough', () => {
  expect(recommendDeload(fatigued('bench-press', 'incline-bench-press'), today, routine)).toBeUndefined();
});

test('a third Fatigued lift of an already named pattern comes after one lift per pattern', () => {
  const ana = fatigued('incline-bench-press', 'bench-press', 'back-squat');
  expect(recommendDeload(ana, today, routine)).toEqual({ reason: 'fatigue', exercises: ['bench-press', 'back-squat', 'incline-bench-press'] });
});

test('Fatigue on isolation or Custom Exercises does not count', () => {
  expect(recommendDeload(fatigued('back-squat', 'barbell-curl'), today, routine)).toBeUndefined();
  expect(recommendDeload(fatigued('back-squat', 'custom-dips'), today, routine)).toBeUndefined();
});

test('Stalls do not count, and neither does Fatigue on an Exercise outside the list', () => {
  const stalled = history([...fatiguedSessions('back-squat'), ...stalledSessions('bench-press'), ...stalledSessions('overhead-press')]);
  expect(recommendDeload(stalled, today, routine)).toBeUndefined();
  expect(recommendDeload(fatigued('back-squat', 'deadlift'), today, routine)).toBeUndefined();
  expect(recommendDeload(history([...fatiguedSessions('back-squat'), ...fine('bench-press')]), today, routine)).toBeUndefined();
});

test('there is no suggestion from time alone', () => {
  expect(recommendDeload(history(fine('bench-press')), '2027-03-01', routine)).toBeUndefined();
});

// A Deload Session: a Session marked when it was started in a Deload Week.
const deloadSession = (localDate: string, exercise: string): Session => ({ ...session(localDate, exercise, [[54, 10, 2]]), deload: true });

test('a week counts as deloaded if its Deload Week is accepted, or if it holds a Deload Session', () => {
  const ana = history(
    [session('2026-07-01', 'bench-press', [[60, 10, 2]]), deloadSession('2026-07-22', 'bench-press'), deloadSession('2026-08-05', 'bench-press')],
    ['2026-08-03', '2026-06-01'],
  );
  expect(deloadedWeeks(ana)).toEqual(['2026-06-01', '2026-07-20', '2026-08-03']);
});


test('none is recommended inside four weeks of a Deload Week', () => {
  const ana = fatigued('back-squat', 'bench-press');
  // A Deload Week three weeks earlier (and the one running now) suppress it.
  expect(recommendDeload({ ...ana, deloadWeeks: ['2026-08-24'] }, today, routine)).toBeUndefined();
  expect(recommendDeload({ ...ana, deloadWeeks: ['2026-09-14'] }, today, routine)).toBeUndefined();
  // Four weeks on, it is allowed again.
  expect(recommendDeload({ ...ana, deloadWeeks: ['2026-08-17'] }, today, routine)?.reason).toBe('fatigue');
});

test('a dismissed suggestion stays quiet for four weeks', () => {
  const ana = fatigued('back-squat', 'bench-press');
  expect(recommendDeload(ana, today, routine, ['2026-08-24'])).toBeUndefined();
  expect(recommendDeload(ana, today, routine, ['2026-08-17'])?.reason).toBe('fatigue');
});

test('a lifter can start a Deload Week any week it is not already on, however recent the last one', () => {
  const ana = (deloadWeeks: string[]) => history([], deloadWeeks);
  expect(canStartDeload(ana([]), today)).toBe(true);
  // The week of 14 September is itself a Deload Week.
  expect(canStartDeload(ana(['2026-09-14']), today)).toBe(false);
  // Last week, three weeks ago or a run of them: all allowed.
  expect(canStartDeload(ana(['2026-09-07']), today)).toBe(true);
  expect(canStartDeload(ana(['2026-08-24']), today)).toBe(true);
  expect(canStartDeload(ana(['2026-08-24', '2026-08-31', '2026-09-07']), today)).toBe(true);
});

test('last week counts as deloaded when its Deload Week is accepted or it holds a Deload Session', () => {
  const sessions = [session('2026-09-01', 'bench-press', [[60, 10, 2]])];
  expect(deloadedLastWeek(history(sessions), today)).toBe(false);
  expect(deloadedLastWeek(history(sessions, ['2026-09-07']), today)).toBe(true);
  expect(deloadedLastWeek(history([...sessions, deloadSession('2026-09-10', 'bench-press')]), today)).toBe(true);
  // Only last week counts: this week and earlier ones do not.
  expect(deloadedLastWeek(history(sessions, ['2026-09-14', '2026-08-31']), today)).toBe(false);
});

test('a Deload Week cancelled before any Session last week does not count as deloaded last week', () => {
  // A cancelled Deload Week is not in deloadWeeks (accepted only) and holds no Deload Session.
  expect(deloadedLastWeek(history([session('2026-09-10', 'bench-press', [[60, 10, 2]])]), today)).toBe(false);
});

// The first Session is in the week of Monday 26 October 2026: quiet in the weeks of 26 Oct, 2 Nov, 9 Nov
// and 16 Nov, and free to suggest from the week of 23 Nov.
test('no Deload Week is suggested in the first four weeks after the first Session', () => {
  const early = (exercise: string) => [
    session('2026-10-27', exercise, [[60, 10]]),
    session('2026-10-29', exercise, [[60, 10]]),
    session('2026-11-03', exercise, [[60, 10]]),
    session('2026-11-05', exercise, [[57, 10]]),
    session('2026-11-10', exercise, [[57, 10]]),
  ];
  const ana = history([...early('bench-press'), ...early('back-squat')]);
  expect(recommendDeload(ana, '2026-11-11', routine)).toBeUndefined();
  expect(recommendDeload(ana, '2026-11-22', routine)).toBeUndefined();
  expect(recommendDeload(ana, '2026-11-23', routine)?.reason).toBe('fatigue');
});


test('a Deload Week has about half the Sets at about 10% less weight, rounded to the Increment', () => {
  const rows = [
    { weightKg: 40, reps: 8 },
    { weightKg: 60, reps: 8 },
    { weightKg: 60, reps: 8 },
    { weightKg: 60, reps: 8 },
  ];
  // The last two Sets, 54 kg rounded to the 2.5 kg Increment is 55.
  expect(deloadRows(rows, 2.5)).toEqual([
    { weightKg: 55, reps: 8 },
    { weightKg: 55, reps: 8 },
  ]);
  // Half of an odd number rounds up; never fewer than one.
  expect(deloadRows(rows.slice(0, 3), 2.5)).toHaveLength(2);
  expect(deloadRows(rows.slice(0, 1), 2.5)).toEqual([{ weightKg: 35, reps: 8 }]);
  // Rows with nothing to go on stay empty, and a bodyweight Exercise with no added weight stays at none.
  expect(deloadRows([undefined, undefined, undefined], 2.5)).toEqual([undefined, undefined]);
  expect(deloadRows([{ weightKg: 0, reps: 10 }], 2.5)).toEqual([{ weightKg: 0, reps: 10 }]);
});
