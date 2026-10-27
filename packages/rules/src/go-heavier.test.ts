import { expect, test } from 'vitest';
import { recommendGoHeavier, type Session, type TrainingHistory } from './index.ts';

// Bench Press with a Rep Range of 8–12, Increment 2.5 kg.
const bench = { repMin: 8, repMax: 12, incrementKg: 2.5 };

// A Session of one Exercise, its Sets given as [weightKg, reps, rir?], all one weight so all Working Sets.
function session(localDate: string, sets: [number, number, number?][], exercise = 'bench-press', custom = false): Session {
  return {
    localDate,
    sets: sets.map(([weightKg, reps, rir], index) => ({
      id: `${localDate}-${index}`,
      exercise,
      custom,
      weightKg,
      reps,
      rir,
    })),
  };
}
const history = (...sessions: Session[]): TrainingHistory => ({ userId: 'ana', sessions, weeklyTargets: [] });

test('every Working Set at the top of the Rep Range recommends the Increment more, back at the bottom of the range', () => {
  const ana = history(session('2026-10-19', [[60, 12], [60, 12], [60, 12]]));
  expect(recommendGoHeavier(ana, 'bench-press', bench)).toEqual({ weightKg: 62.5, reps: 8, incrementKg: 2.5 });
});

test('Warm-up Sets are ignored, and the Increment is added to the training weight', () => {
  const ana = history(session('2026-10-19', [[40, 5], [60, 12], [60, 12]]));
  expect(recommendGoHeavier(ana, 'bench-press', bench)).toEqual({ weightKg: 62.5, reps: 8, incrementKg: 2.5 });
});

test("the Exercise's last Session is the one that counts, even with other Exercises since", () => {
  const ana = history(
    session('2026-10-19', [[60, 12], [60, 12]]),
    session('2026-10-21', [[100, 5], [100, 5]], 'back-squat'),
  );
  expect(recommendGoHeavier(ana, 'bench-press', bench)).toEqual({ weightKg: 62.5, reps: 8, incrementKg: 2.5 });
});

test('an Exercise never done recommends nothing', () => {
  expect(recommendGoHeavier(history(), 'bench-press', bench)).toBeUndefined();
});

test('RIR 0 on the Sets at the top waits for one more Session that reaches the top', () => {
  const grinding = session('2026-10-19', [[60, 12, 1], [60, 12, 0], [60, 12, 1]]);
  expect(recommendGoHeavier(history(grinding), 'bench-press', bench)).toBeUndefined();

  const short = session('2026-10-21', [[60, 11], [60, 10], [60, 10]]);
  expect(recommendGoHeavier(history(grinding, short), 'bench-press', bench)).toBeUndefined();

  const again = session('2026-10-23', [[60, 12, 0], [60, 12, 0], [60, 12, 0]]);
  expect(recommendGoHeavier(history(grinding, again), 'bench-press', bench)).toEqual({ weightKg: 62.5, reps: 8, incrementKg: 2.5 });
});

test('RIR of 1 or more, or none logged, does not delay', () => {
  const easy = session('2026-10-19', [[60, 12, 1], [60, 12, 2], [60, 12]]);
  expect(recommendGoHeavier(history(easy), 'bench-press', bench)).toEqual({ weightKg: 62.5, reps: 8, incrementKg: 2.5 });
});

test("the Increment is the Exercise's own, so a lifter's override of 1.25 kg changes the step", () => {
  const ana = history(session('2026-10-19', [[60, 12], [60, 12]]));
  expect(recommendGoHeavier(ana, 'bench-press', { ...bench, incrementKg: 1.25 })).toEqual({ weightKg: 61.25, reps: 8, incrementKg: 1.25 });
});

test('a Custom Exercise never gets a recommendation', () => {
  const ana = history(session('2026-10-19', [[20, 12], [20, 12]], 'custom-assisted-dip', true));
  expect(recommendGoHeavier(ana, 'custom-assisted-dip', bench)).toBeUndefined();
});

test('a Working Set short of the top of the Rep Range recommends nothing', () => {
  const ana = history(session('2026-10-19', [[60, 12], [60, 11], [60, 12]]));
  expect(recommendGoHeavier(ana, 'bench-press', bench)).toBeUndefined();
});
