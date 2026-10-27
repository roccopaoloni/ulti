import { expect, test } from 'vitest';
import { deriveScoringEvents, seasonOf, type PersonalRecord, type Session } from '../index.ts';
import { perfectConsistencyRank, simulatePopulation } from './lifters.ts';

// The scoring targets (spec: Balance, Rank), checked on a fixed-seed simulated population so the
// numbers are the same every run. 1,000 lifters keep the sampling error near 1 percentage point.
const { summary } = simulatePopulation(2026, 1000);

test('a typical lifter earns about 60% of their Season Points from Consistency and 40% from Progress', () => {
  expect(summary.consistencyShare).toBeGreaterThan(0.55);
  expect(summary.consistencyShare).toBeLessThan(0.65);
  expect(summary.medianConsistencyShare).toBeGreaterThan(0.55);
  expect(summary.medianConsistencyShare).toBeLessThan(0.65);
});

test('a full Season of perfect consistency with no Personal Records tops out in Gold, at every Weekly Target and Season length', () => {
  // 13 weeks start in an ordinary quarter; a quarter that starts on a Monday and has 92 days has 14.
  const seasons = [seasonOf('2026-11-15'), { start: '2030-07-01', end: '2030-09-30' }];
  for (const season of seasons) {
    for (const target of [2, 3, 4, 5, 6]) expect(perfectConsistencyRank(target, season).tier).toBe('gold');
  }
});

test('Elite is roughly the top few percent of honest lifters', () => {
  expect(summary.tierShares.elite).toBeGreaterThanOrEqual(0.02);
  expect(summary.tierShares.elite).toBeLessThanOrEqual(0.05);
});

// A Session of one Exercise at a weight and reps; the e1RM is weight * (1 + reps / 30).
const session = (localDate: string, exercise: string, e1rm: number): Session => ({
  localDate,
  sets: [{ id: `${localDate}-${exercise}`, exercise, custom: false, weightKg: e1rm / (1 + 10 / 30), reps: 10 }],
});

// Two Calibration Sessions at `from`, then a Personal Record at `to` on the bench press.
const recordFrom = (from: number, to: number): PersonalRecord => {
  const sessions = [session('2026-10-05', 'bench-press', from), session('2026-10-06', 'bench-press', from), session('2026-10-07', 'bench-press', to)];
  const profile = { sex: [{ effectiveFrom: '2026-01-01', value: 'male' as const }], bodyweightKg: [{ effectiveFrom: '2026-01-01', value: 80 }] };
  const [record] = deriveScoringEvents({ userId: 'ana', sessions, weeklyTargets: [], profile });
  return record as PersonalRecord;
};

test('a 1% gain at an advanced level (90th percentile) is worth about a 5% gain at a beginner level (20th)', () => {
  // The standards for a 80 kg man's bench press: 119.52 kg e1RM is the 90th percentile, 75.11 kg the 20th.
  const advanced = recordFrom(119.52 / 1.01, 119.52);
  const beginner = recordFrom(75.1133 / 1.05, 75.1133);

  expect(advanced.strengthLevelPercentile).toBeCloseTo(90, 1);
  expect(beginner.strengthLevelPercentile).toBeCloseTo(20, 1);
  expect(advanced.progressPoints / beginner.progressPoints).toBeGreaterThan(0.95);
  expect(advanced.progressPoints / beginner.progressPoints).toBeLessThan(1.05);
});

test('the per-record cap leaves a 5% gain at a mid level whole and holds a 10% gain to the cap', () => {
  // The 50th percentile of that man's bench press is 92.62 kg.
  const large = recordFrom(92.62 / 1.05, 92.62);
  const huge = recordFrom(92.62 / 1.1, 92.62);

  expect(large.progressPoints).toBeGreaterThan(100);
  expect(huge.progressPoints).toBeGreaterThan(large.progressPoints);
  expect(huge.progressPoints).toBe(150);
});
