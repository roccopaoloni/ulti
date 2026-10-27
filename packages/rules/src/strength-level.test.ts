import { expect, test } from 'vitest';
import { deriveScoringEvents, strengthLevelPercentile, type Session, type Sex } from './index.ts';

// The expected numbers come from FitnessVolt's gym tables (kg): male back squat, 83 kg class,
// e1RM at the 10th/25th/50th/75th/90th/95th percentile = 82.51 / 102.01 / 122.52 / 144.65 / 164.65 / 177.72.

let next = 0;
const set = (exercise: string, weightKg: number, reps: number) => ({
  id: `set-${++next}`,
  exercise,
  custom: false,
  weightKg,
  reps,
});
const session = (localDate: string, ...sets: ReturnType<typeof set>[]): Session => ({ localDate, sets });
const profile = (sex: Sex, bodyweightKg: number) => ({
  sex: [{ effectiveFrom: '2026-01-01', value: sex }],
  bodyweightKg: [{ effectiveFrom: '2026-01-01', value: bodyweightKg }],
});

// A lifter whose first two squat Sessions set a baseline of e1RM `base`, and whose third, 5 kg
// heavier on the bar, is a Personal Record.
function squatRecord(history: { sex: Sex; bodyweightKg: number }, base: number, record: number) {
  const reps = 6;
  return deriveScoringEvents({
    userId: 'ana',
    profile: profile(history.sex, history.bodyweightKg),
    sessions: [
      session('2026-10-05', set('back-squat', base / 1.2, reps)),
      session('2026-10-12', set('back-squat', base / 1.2, reps)),
      session('2026-10-19', set('back-squat', record / 1.2, reps)),
    ],
  })[0]!;
}

test("a Personal Record records the percentile and bodyweight used: a male 83 kg lifter's 126 kg e1RM squat is between the 50th and 75th", () => {
  // 126 kg is 3.48 of the 22.13 kg from the 50th to the 75th percentile: 50 + 25 × 3.48 / 22.13 = 53.93.
  const record = squatRecord({ sex: 'male', bodyweightKg: 83 }, 120, 126);
  expect(record.strengthLevelPercentile).toBeCloseTo(53.93, 1);
  expect(record.bodyweightKg).toBe(83);
  // 5% gain × 10 points × a weight a little over 1 for being a little above the 50th.
  expect(record.progressPoints).toBe(55);
});

test("a 1% gain at an advanced level is worth about the same as a 5% gain at a beginner level", () => {
  // Beginner: e1RM 90 → 94.5 kg is about the 19th percentile. Advanced: 165 → 166.65 kg, the 90th.
  const beginner = squatRecord({ sex: 'male', bodyweightKg: 83 }, 90, 94.5);
  const advanced = squatRecord({ sex: 'male', bodyweightKg: 83 }, 165, 166.65);
  expect(beginner.percentGain).toBe(5);
  expect(advanced.percentGain).toBe(1);
  expect(beginner.progressPoints).toBe(25);
  // 166.65 kg is a little past the 90th (90.8), so it earns a point more.
  expect(advanced.progressPoints).toBe(26);
});

test('the weight class is the lightest one that holds the bodyweight, and a missing class falls back to the nearest the lift has', () => {
  // Female snatch press has no class above 76 kg: a 90 kg lifter is read against the 76 kg row,
  // whose 50th percentile is 31.21 kg.
  expect(strengthLevelPercentile('snatch-press', 31.21, 'female', 90)).toBeCloseTo(50, 5);
  // Male back squat: 80 kg belongs to the 83 kg class.
  expect(strengthLevelPercentile('back-squat', 122.52, 'male', 80)).toBeCloseTo(50, 5);
});

test('"prefer not to say" uses the midpoint between the male and female standards', () => {
  // Male 83 kg 50th is 122.52 kg and female 84 kg 50th is 89.95 kg: the midpoint is 106.235 kg.
  expect(strengthLevelPercentile('back-squat', 106.235, 'unspecified', 83)).toBeCloseTo(50, 5);
});

test('a lift with no standards has no Strength Level', () => {
  expect(strengthLevelPercentile('lat-pulldown', 80, 'male', 83)).toBeUndefined();
});

test('a change to bodyweight only affects later events', () => {
  const reps = 6;
  const events = deriveScoringEvents({
    userId: 'ana',
    profile: {
      sex: [{ effectiveFrom: '2026-01-01', value: 'male' }],
      bodyweightKg: [
        { effectiveFrom: '2026-01-01', value: 83 },
        { effectiveFrom: '2026-10-15', value: 93 },
      ],
    },
    sessions: [
      session('2026-10-05', set('back-squat', 100, reps)),
      session('2026-10-06', set('back-squat', 100, reps)),
      session('2026-10-12', set('back-squat', 105, reps)),
      session('2026-10-19', set('back-squat', 110, reps)),
    ],
  });
  expect(events.map((event) => event.bodyweightKg)).toEqual([83, 93]);
});

test("Exercises that aren't Benchmark Lifts use the average of the lifter's levels on the Benchmark Lifts they do", () => {
  // Male 83 kg: squat e1RM 122.52 kg is the 50th percentile, and bench press 92.62 kg is the 50th
  // too, so use bench 106.68 kg (75th). The average of 50 and 75 is 62.5.
  const events = deriveScoringEvents({
    userId: 'ana',
    profile: profile('male', 83),
    sessions: [
      session('2026-10-05', set('back-squat', 122.52 / 1.2, 6), set('bench-press', 106.68 / 1.2, 6), set('lat-pulldown', 50, 6)),
      session('2026-10-06', set('lat-pulldown', 50, 6)),
      session('2026-10-12', set('lat-pulldown', 55, 6)),
    ],
  });
  expect(events).toHaveLength(1);
  expect(events[0]!.exercise).toBe('lat-pulldown');
  expect(events[0]!.strengthLevelPercentile).toBeCloseTo(62.5, 1);
});

test('a lifter with no Benchmark Lifts counts as the 50th percentile', () => {
  const events = deriveScoringEvents({
    userId: 'ana',
    profile: profile('male', 83),
    sessions: [
      session('2026-10-05', set('lat-pulldown', 50, 6)),
      session('2026-10-12', set('lat-pulldown', 50, 6)),
      session('2026-10-19', set('lat-pulldown', 55, 6)),
    ],
  });
  expect(events[0]!.strengthLevelPercentile).toBe(50);
});
