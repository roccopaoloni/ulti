import { expect, test } from 'vitest';
import { CEILINGS, deriveScoringEvents, e1rm, isImplausibleSet, type PersonalRecord, type Session } from './index.ts';

const lift = (exercise: string, weightKg: number, reps: number, extra: object = {}) => ({
  exercise,
  custom: false,
  weightKg,
  reps,
  ...extra,
});

// The heaviest single weight that is still on the ceiling for the given reps.
const atCeiling = (exercise: string, reps: number) => CEILINGS[exercise]!.kg / e1rm(1, reps);

test('heavy weight for few reps is implausible: a 700 kg bench press', () => {
  expect(isImplausibleSet(lift('bench-press', 700, 1))).toBe(true);
});

test('light weight for many reps is implausible too: 300 kg bench press for 30 reps', () => {
  // e1RM 300 * (1 + 30/30) = 600 kg, over the bench press ceiling though a single at 300 is not
  expect(isImplausibleSet(lift('bench-press', 300, 1))).toBe(false);
  expect(isImplausibleSet(lift('bench-press', 300, 30))).toBe(true);
});

test('a normal Set is plausible, and a Set exactly at the ceiling is too', () => {
  expect(isImplausibleSet(lift('back-squat', 140, 5))).toBe(false);
  expect(isImplausibleSet(lift('bench-press', atCeiling('bench-press', 5), 5))).toBe(false);
  expect(isImplausibleSet(lift('bench-press', atCeiling('bench-press', 5) + 1, 5))).toBe(true);
});

test('Warm-up Sets are checked too: the check does not look at the label', () => {
  expect(isImplausibleSet(lift('deadlift', 900, 3, { label: 'warm-up' }))).toBe(true);
});

test('a Custom Exercise is never implausible', () => {
  expect(isImplausibleSet(lift('my-sled-push', 5000, 50, { custom: true }))).toBe(false);
});

test('a bodyweight Exercise counts bodyweight plus the added weight', () => {
  const pullUp = (addedKg: number) => lift('pull-up', addedKg, 1, { bodyweight: true });
  const limit = atCeiling('pull-up', 1);
  // For a 100 kg lifter, an added weight that is fine alone goes over with the bodyweight on top
  expect(isImplausibleSet(pullUp(limit - 50), 100)).toBe(true);
  expect(isImplausibleSet(pullUp(limit - 150), 100)).toBe(false);
});

test('a bodyweight Exercise with no bodyweight logged counts the added weight alone', () => {
  const limit = atCeiling('pull-up', 1);
  expect(isImplausibleSet(lift('pull-up', limit - 50, 1, { bodyweight: true }))).toBe(false);
  expect(isImplausibleSet(lift('pull-up', limit + 50, 1, { bodyweight: true }))).toBe(true);
});

const squat = (id: string, weightKg: number, reps: number) => ({ id, exercise: 'back-squat', custom: false, weightKg, reps });
const training = (...all: Session[]) => ({ userId: 'ana', weeklyTargets: [{ effectiveFrom: '2026-09-01', value: 3 }], sessions: all });
const day = (localDate: string, ...sets: Session['sets']): Session => ({ localDate, sets });
const six = (date: string, id: string, kg: number) => day(date, ...[1, 2, 3, 4, 5, 6].map((n) => squat(`${id}${n}`, kg, 5)));

test('deriving Scoring Events ignores a Set over the ceiling: no Personal Record from it', () => {
  const history = training(
    six('2026-10-05', 'a', 100),
    six('2026-10-07', 'b', 100),
    six('2026-10-09', 'c', 100),
    day('2026-10-12', squat('typo', 1000, 5), squat('ok', 105, 5)),
  );
  const records = deriveScoringEvents(history).filter((e): e is PersonalRecord => e.kind === 'personal-record');
  expect(records.map((r) => r.setId)).toEqual(['ok']);
});

test('a Session whose Sets are all over the ceiling does not count toward Consistency', () => {
  const typos = day('2026-10-12', ...[1, 2, 3, 4, 5, 6].map((n) => squat(`typo${n}`, 1000, 5)));
  expect(deriveScoringEvents(training(typos))).toEqual([]);
});
