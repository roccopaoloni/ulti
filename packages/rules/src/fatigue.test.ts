import { expect, test } from 'vitest';
import { recommend, recommendFatigue, type Session, type TrainingHistory } from './index.ts';

// Bench Press with a Rep Range of 8–12, Increment 2.5 kg.
const bench = { repMin: 8, repMax: 12, incrementKg: 2.5 };

// A Session of one Exercise, its Sets given as [weightKg, reps, rir?], all one weight so all Working Sets.
function session(localDate: string, sets: [number, number, number?][], exercise = 'bench-press', deload = false): Session {
  return {
    localDate,
    deload,
    sets: sets.map(([weightKg, reps, rir], index) => ({ id: `${localDate}-${index}`, exercise, custom: false, weightKg, reps, rir })),
  };
}
const history = (...sessions: Session[]): TrainingHistory => ({ userId: 'ana', sessions, weeklyTargets: [] });
const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;

// The Calibration Sessions only set the baseline: the first two Sessions of an Exercise.
const calibration = [session('2026-09-26', [[60, 10]]), session('2026-09-28', [[60, 10]])];
// The same, with RIR logged, and Calibration Sessions at 8 reps.
const calibrationRir = [session('2026-09-26', [[60, 10, 0]]), session('2026-09-28', [[60, 10, 0]])];
const calibration8 = [session('2026-09-26', [[60, 8]]), session('2026-09-28', [[60, 8]])];
const solid = (n: number) => session(day(n), [[60, 10], [60, 10]]);
const weak = (n: number) => session(day(n), [[57, 10], [57, 10]]);

test('two Sessions each at least 3% under the best before are Fatigue, reset about 10% lighter at the bottom of the range', () => {
  const ana = history(...calibration, solid(1), weak(3), weak(5));
  expect(recommendFatigue(ana, 'bench-press', bench)).toEqual({ weightKg: 52.5, reps: 8 });
});

test('Fatigue (B) is measured against the average of the Sessions before, not the best of them', () => {
  const peak = session(day(2), [[60, 12]]);
  const dip = (n: number) => session(day(n), [[59, 10]]);
  // 59 kg x 10 is 6% under the peak but 2.9% under the 81 kg average of the Sessions before it.
  expect(recommendFatigue(history(...calibration, solid(1), peak, dip(4), dip(6)), 'bench-press', bench)).toBeUndefined();
});

test('one Session under the best, or a dip under 3%, is not Fatigue', () => {
  const close = (n: number) => session(day(n), [[58.5, 10]]);
  expect(recommendFatigue(history(...calibration, solid(1), solid(3), weak(5)), 'bench-press', bench)).toBeUndefined();
  expect(recommendFatigue(history(...calibration, solid(1), close(3), close(5)), 'bench-press', bench)).toBeUndefined();
});

test('a Session back at the best breaks the run', () => {
  expect(recommendFatigue(history(...calibration, solid(1), weak(3), solid(5), weak(7)), 'bench-press', bench)).toBeUndefined();
});

test('the Calibration Sessions only set the baseline: two weak Sessions right after them are not judged', () => {
  expect(recommendFatigue(history(solid(1), weak(3), weak(5)), 'bench-press', bench)).toBeUndefined();
  expect(recommendFatigue(history(solid(1), solid(2), weak(3), weak(5)), 'bench-press', bench)).toEqual({ weightKg: 52.5, reps: 8 });
});

test('the average is over the up to 6 Sessions before, so an old peak is forgotten', () => {
  const peak = session(day(1), [[60, 12]]);
  const steady = (n: number) => session(day(n), [[60, 10]]);
  // 58.3 kg x 10 is 2.8% under 60 x 10: Fatigue only while the peak lifts the average of the 6 before it.
  const dip = (n: number) => session(day(n), [[58.3, 10]]);
  expect(recommendFatigue(history(...calibration, peak, steady(2), steady(3), dip(4), dip(5)), 'bench-press', bench)).toEqual({ weightKg: 52.5, reps: 8 });
  expect(recommendFatigue(history(...calibration, peak, ...[2, 3, 4, 5, 6, 7].map(steady), dip(8), dip(9)), 'bench-press', bench)).toBeUndefined();
});

test('Sets over 12 reps and Deload Sessions are ignored', () => {
  const long = (n: number) => session(day(n), [[40, 15]]);
  expect(recommendFatigue(history(...calibration, solid(1), long(3), long(5)), 'bench-press', bench)).toBeUndefined();
  expect(recommendFatigue(history(...calibration, solid(1), weak(3), session(day(4), [[30, 10]], 'bench-press', true), weak(5)), 'bench-press', bench)).toEqual({ weightKg: 52.5, reps: 8 });
});

test('a 10% reset is not more Fatigue: the lighter Sessions after it are judged only against themselves', () => {
  const ana = history(...calibration, solid(1), solid(3), session(day(5), [[54, 10]]), session(day(7), [[54, 9]]), session(day(9), [[54, 9]]));
  expect(recommendFatigue(ana, 'bench-press', bench)).toBeUndefined();
  // A drop of under 7.5% is no reset, so the same weights lighter still read as Fatigue.
  const small = history(...calibration, solid(1), solid(3), session(day(5), [[56, 10]]), session(day(7), [[56, 10]]));
  expect(recommendFatigue(small, 'bench-press', bench)).toEqual({ weightKg: 50, reps: 8 });
});

test('with RIR logged on both top Sets the comparison is RIR-adjusted: 60 kg x 7 at RIR 3 is as good as x 10 at RIR 0', () => {
  const fresh = (n: number) => session(day(n), [[60, 10, 0]]);
  const easy = (n: number) => session(day(n), [[60, 7, 3]]);
  expect(recommendFatigue(history(...calibrationRir, fresh(1), easy(3), easy(5)), 'bench-press', bench)).toBeUndefined();
  // Without RIR on the later Sessions the plain figure is used, and they are 7% lower.
  const bare = (n: number) => session(day(n), [[60, 7]]);
  expect(recommendFatigue(history(...calibration, fresh(1), bare(3), bare(5)), 'bench-press', bench)).toEqual({ weightKg: 55, reps: 8 });
});

test('RIR 4 and over counts as 4', () => {
  const lots = (n: number) => session(day(n), [[60, 7, 9]]);
  const four = session(day(1), [[60, 7, 4]]);
  expect(recommendFatigue(history(...calibrationRir.map((s) => ({ ...s, sets: s.sets.map((set) => ({ ...set, reps: 7, rir: 4 })) })), four, lots(3), lots(5)), 'bench-press', bench)).toBeUndefined();
});

test('effort creep is Fatigue: the last 3 Sessions at the same weight, with average RIR falling each time', () => {
  const creep = (n: number, rir: number) => session(day(n), [[60, 8, rir], [60, 8, rir]]);
  expect(recommendFatigue(history(...calibration8, creep(1, 3), creep(3, 2), creep(5, 1)), 'bench-press', bench)).toEqual({ weightKg: 55, reps: 8 });
  // Held (not falling), or a different weight, is no creep.
  expect(recommendFatigue(history(...calibration8, creep(1, 3), creep(3, 2), creep(5, 2)), 'bench-press', bench)).toBeUndefined();
  const heavier = session(day(5), [[62.5, 8, 1]]);
  expect(recommendFatigue(history(...calibration8, creep(1, 3), creep(3, 2), heavier), 'bench-press', bench)).toBeUndefined();
});

test('a Fatigue reset wins over going heavier', () => {
  const top = (n: number, rir: number) => session(day(n), [[60, 12, rir], [60, 12, rir]]);
  const ana = history(...calibration8, top(1, 3), top(3, 2), top(5, 1));
  expect(recommend(ana, 'bench-press', bench)).toEqual({ kind: 'fatigue', weightKg: 55, reps: 8 });
});

test('Fatigue wins over a Stall, and a Stall still wins over going heavier', () => {
  expect(recommend(history(...calibration, solid(1), weak(3), weak(5)), 'bench-press', bench)).toEqual({ kind: 'fatigue', weightKg: 52.5, reps: 8 });
  expect(recommend(history(...calibration, solid(1), solid(8), solid(15), solid(22)), 'bench-press', bench)).toEqual({ kind: 'stall', weightKg: 62.5, reps: 6, repMin: 6, repMax: 8 });
});

test('missing the bottom of the Rep Range is no longer a Stall', () => {
  const low = (n: number, weight: number) => session(day(n), [[weight, 8], [weight, 7]]);
  expect(recommend(history(...calibration, low(1, 62), low(3, 65)), 'bench-press', bench)).toBeUndefined();
});

test('a bodyweight Exercise judges the added weight plus the average bodyweight', () => {
  const pull = (n: number, added: number, reps: number): Session => ({
    localDate: day(n),
    sets: [{ id: `p${n}`, exercise: 'pull-up', custom: false, bodyweight: true, weightKg: added, reps }],
  });
  const rule = { repMin: 6, repMax: 10, incrementKg: 2.5 };
  const sessions = [pull(1, 20, 8), pull(2, 20, 8), pull(3, 20, 8), pull(5, 20, 6), pull(7, 20, 6)];
  // 100 kg load x 8 against 100 kg x 6 is 5.7% lower in e1RM, twice. 10% of the 100 kg load is 10 kg off the 20 kg added.
  const withBodyweight: TrainingHistory = { ...history(...sessions), profile: { sex: [], bodyweightKg: [{ effectiveFrom: '2026-01-01', value: 80 }] } };
  expect(recommendFatigue(withBodyweight, 'pull-up', rule)).toEqual({ weightKg: 10, reps: 6 });
  // Without a bodyweight on record it can't be judged.
  expect(recommendFatigue(history(...sessions), 'pull-up', rule)).toBeUndefined();
});
