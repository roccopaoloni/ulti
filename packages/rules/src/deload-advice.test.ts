import { expect, test } from 'vitest';
import { canStartDeload, deloadedLastWeek, deloadedWeeks, deloadRows, recommendDeload, type Session, type TrainingHistory } from './index.ts';

const rule = { repMin: 8, repMax: 12, incrementKg: 2.5 };
// The Routine's catalog Exercises, with their Rep Ranges and Increments.
const routine = [
  { exercise: 'bench-press', rule },
  { exercise: 'back-squat', rule },
  { exercise: 'overhead-press', rule },
];

// A Session of one Exercise, given as the [weightKg, reps, rir] of each Set (all one weight, so all Working Sets).
function session(localDate: string, exercise: string, sets: [number, number, number?][]): Session {
  return {
    localDate,
    sets: sets.map(([weightKg, reps, rir], i) => ({ id: `${localDate}-${exercise}-${i}`, exercise, custom: false, weightKg, reps, rir })),
  };
}
const history = (sessions: Session[], deloadWeeks: string[] = []): TrainingHistory => ({ userId: 'ana', sessions, weeklyTargets: [], deloadWeeks });

// A Stall for the Exercise by Sessions on 2026-08-03 (best), then four flat ones, the last three past Calibration.
const stalledSessions = (exercise: string) => [
  session('2026-08-03', exercise, [[60, 10]]),
  session('2026-08-05', exercise, [[60, 10]]),
  session('2026-09-09', exercise, [[60, 9]]),
  session('2026-09-14', exercise, [[60, 9]]),
  session('2026-09-16', exercise, [[60, 9]]),
];
// Same top weight in three Sessions with the RIR going 3, 2, 1 (falling), after a first Session more than four weeks back.
const fallingRir = (exercise: string) => [
  session('2026-08-03', exercise, [[60, 10]]),
  session('2026-09-09', exercise, [[60, 10, 3]]),
  session('2026-09-14', exercise, [[60, 10, 2]]),
  session('2026-09-16', exercise, [[60, 10, 1]]),
];
// A progressing lifter with steady RIR, so no trigger fires.
const fine = (exercise: string) => [
  session('2026-09-09', exercise, [[60, 10, 2]]),
  session('2026-09-14', exercise, [[62.5, 10, 2]]),
  session('2026-09-16', exercise, [[65, 10, 2]]),
];

const today = '2026-09-17';

test('two Stalled Exercises in the Routine recommend a Deload Week', () => {
  const ana = history([...stalledSessions('bench-press'), ...stalledSessions('back-squat')]);
  expect(recommendDeload(ana, today, routine)).toBe('stalled');
});

test('one Stalled Exercise is not enough', () => {
  const ana = history([...stalledSessions('bench-press'), ...fine('back-squat'), ...fine('overhead-press')]);
  expect(recommendDeload(ana, today, routine)).toBeUndefined();
});

test('Stalled Exercises outside the Routine, or Custom ones, do not count', () => {
  const ana = history([...stalledSessions('bench-press'), ...stalledSessions('deadlift')]);
  expect(recommendDeload(ana, today, routine)).toBeUndefined();
});

test('RIR falling at the same weights in two Exercises recommends a Deload Week', () => {
  const ana = history([...fallingRir('bench-press'), ...fallingRir('back-squat')]);
  expect(recommendDeload(ana, today, routine)).toBe('rir');
});

test('RIR falling in only one Exercise is not enough', () => {
  const ana = history([...fallingRir('bench-press'), ...fine('back-squat')]);
  expect(recommendDeload(ana, today, routine)).toBeUndefined();
});

test('RIR falling because the weight went up is not fatigue', () => {
  const heavier = (exercise: string) => [
    session('2026-09-09', exercise, [[60, 10, 3]]),
    session('2026-09-14', exercise, [[62.5, 10, 2]]),
    session('2026-09-16', exercise, [[65, 10, 1]]),
  ];
  expect(recommendDeload(history([...heavier('bench-press'), ...heavier('back-squat')]), today, routine)).toBeUndefined();
});

test('RIR must fall over three Sessions, not just two, and Sessions without RIR are skipped', () => {
  const twoSessions = (exercise: string) => [session('2026-09-14', exercise, [[60, 10, 2]]), session('2026-09-16', exercise, [[60, 10, 1]])];
  expect(recommendDeload(history([...twoSessions('bench-press'), ...twoSessions('back-squat')]), today, routine)).toBeUndefined();
  const unlogged = (exercise: string) => [...fallingRir(exercise), session('2026-09-17', exercise, [[70, 10]])];
  expect(recommendDeload(history([...unlogged('bench-press'), ...unlogged('back-squat')]), today, routine)).toBe('rir');
});

test('eight weeks since the last Deload Week nudges for another', () => {
  // The last Deload Week began Monday 20 July; the week of 14 September is its 8th after.
  const ana = history([session('2026-07-01', 'bench-press', [[60, 10, 2]]), ...fine('bench-press')], ['2026-07-20']);
  expect(recommendDeload(ana, '2026-09-10', routine)).toBeUndefined();
  expect(recommendDeload(ana, '2026-09-14', routine)).toBe('time');
});

test('with no Deload Week yet, the eight weeks count from the first Session', () => {
  const sessions = [session('2026-07-22', 'bench-press', [[60, 10, 2]]), ...fine('bench-press')];
  expect(recommendDeload(history(sessions), '2026-09-14', routine)).toBe('time');
  expect(recommendDeload(history(sessions), '2026-09-13', routine)).toBeUndefined();
  expect(recommendDeload(history([]), '2026-09-14', routine)).toBeUndefined();
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

test('a Deload Week cancelled before any Deload Session leaves no trace for the eight-week clock', () => {
  // A cancelled Deload Week is not in deloadWeeks (accepted only) and holds no Deload Session.
  const sessions = [session('2026-07-22', 'bench-press', [[60, 10, 2]]), ...fine('bench-press')];
  expect(deloadedWeeks(history(sessions))).toEqual([]);
  expect(recommendDeload(history(sessions), '2026-09-13', routine)).toBeUndefined();
  expect(recommendDeload(history(sessions), '2026-09-14', routine)).toBe('time');
});

test('a cancelled Deload Week that holds a Deload Session resets the eight-week clock', () => {
  const sessions = [session('2026-07-06', 'bench-press', [[60, 10, 2]]), deloadSession('2026-08-05', 'bench-press'), ...fine('bench-press')];
  // Eight weeks from the first Session would be 31 August; the Deload Session in the week of 3 August moves it to 28 September.
  expect(recommendDeload(history(sessions), '2026-09-14', routine)).toBeUndefined();
  expect(recommendDeload(history(sessions), '2026-09-28', routine)).toBe('time');
});

test('a Stall wins over the other reasons, and none is recommended inside four weeks of a Deload Week', () => {
  const stalled = [...stalledSessions('bench-press'), ...stalledSessions('back-squat')];
  const sessions = [session('2026-06-01', 'bench-press', [[60, 10, 2]]), ...stalled];
  expect(recommendDeload(history(sessions), today, routine)).toBe('stalled');
  // A Deload Week three weeks earlier (and the one running now) suppress it.
  expect(recommendDeload(history(sessions, ['2026-08-24']), today, routine)).toBeUndefined();
  expect(recommendDeload(history(sessions, ['2026-09-14']), today, routine)).toBeUndefined();
  // Four weeks on, it is allowed again; the deload Sessions are ignored by the Stall rule meanwhile.
  expect(recommendDeload(history(sessions, ['2026-08-17']), today, routine)).toBe('stalled');
});

test('a dismissed suggestion stays quiet for four weeks', () => {
  const ana = history([...stalledSessions('bench-press'), ...stalledSessions('back-squat')]);
  expect(recommendDeload(ana, today, routine, ['2026-08-24'])).toBeUndefined();
  expect(recommendDeload(ana, today, routine, ['2026-08-17'])).toBe('stalled');
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
test('no Deload Week is suggested in the first four weeks after the first Session: Stalled', () => {
  const early = (exercise: string) =>
    ['2026-10-27', '2026-10-29', '2026-11-03', '2026-11-05', '2026-11-10'].map((day, i) => session(day, exercise, [[60, i === 0 ? 10 : 9]]));
  const ana = history([...early('bench-press'), ...early('back-squat')]);
  expect(recommendDeload(ana, '2026-11-11', routine)).toBeUndefined();
  expect(recommendDeload(ana, '2026-11-22', routine)).toBeUndefined();
  expect(recommendDeload(ana, '2026-11-23', routine)).toBe('stalled');
});

test('no Deload Week is suggested in the first four weeks after the first Session: RIR falling', () => {
  const early = (exercise: string) => [
    session('2026-10-27', exercise, [[60, 10, 3]]),
    session('2026-11-03', exercise, [[60, 10, 2]]),
    session('2026-11-05', exercise, [[60, 10, 1]]),
  ];
  const ana = history([...early('bench-press'), ...early('back-squat')]);
  expect(recommendDeload(ana, '2026-11-06', routine)).toBeUndefined();
  expect(recommendDeload(ana, '2026-11-22', routine)).toBeUndefined();
  expect(recommendDeload(ana, '2026-11-23', routine)).toBe('rir');
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
