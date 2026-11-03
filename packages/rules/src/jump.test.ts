import { expect, test } from 'vitest';
import { deriveScoringEvents, findJumps, strengthLevelPercentile, type PersonalRecord, type Session } from './index.ts';

let next = 0;
const set = (exercise: string, weightKg: number, reps: number, extra: object = {}) => ({
  id: `set-${++next}`,
  exercise,
  custom: false,
  weightKg,
  reps,
  ...extra,
});
const day = (localDate: string, ...sets: ReturnType<typeof set>[]): Session => ({ localDate, sets });
// A male lifter of the given bodyweight, so his Strength Level comes from the male standards.
const man = (bodyweightKg: number, ...sessions: Session[]) => ({
  userId: 'ana',
  weeklyTargets: [],
  sessions,
  profile: { sex: [{ effectiveFrom: '2026-01-01', value: 'male' as const }], bodyweightKg: [{ effectiveFrom: '2026-01-01', value: bodyweightKg }] },
});
const bench = (kg: number, extra: object = {}) => set('bench-press', kg, 1, extra);
// Two Calibration Sessions at the starting weight in early September, then a month later the candidate.
const month = (start: number, candidate: ReturnType<typeof set>, bodyweightKg = 83) =>
  man(bodyweightKg, day('2026-09-01', bench(start)), day('2026-09-03', bench(start)), day('2026-09-28', candidate));
const e1rm1 = (kg: number) => kg * (1 + 1 / 30);

test('a beginner at 40 kg who benches 55 kg a month later (+37%) passes', () => {
  const candidate = bench(55);
  // The baseline 40 kg is below the 25th percentile of an 83 kg man, so the limit is +40%
  expect(strengthLevelPercentile('bench-press', e1rm1(40), 'male', 83)).toBeLessThan(25);
  expect(findJumps(month(40, candidate)).has(candidate.id)).toBe(false);
});

test('a lifter at the 50th percentile who goes from 80 to 100 kg (+25%) has made a jump, 25% over', () => {
  const candidate = bench(100);
  const percentile = strengthLevelPercentile('bench-press', e1rm1(80), 'male', 83)!;
  expect(percentile).toBeGreaterThan(25);
  expect(percentile).toBeLessThan(75);
  expect([...findJumps(month(80, candidate)).entries()]).toEqual([[candidate.id, 25]]);
});

test('an advanced lifter who goes from 140 to 150 kg (+7%) passes, but 160 kg (+14%) is a jump', () => {
  expect(strengthLevelPercentile('bench-press', e1rm1(140), 'male', 105)).toBeGreaterThan(75);
  const fine = bench(150);
  expect(findJumps(month(140, fine, 105)).has(fine.id)).toBe(false);
  const big = bench(160);
  expect(findJumps(month(140, big, 105)).get(big.id)).toBeCloseTo(14.29, 1);
});

test('without sex or bodyweight a lifter counts as the 50th percentile: +20%', () => {
  const sessions = (candidate: ReturnType<typeof set>) => [day('2026-09-01', bench(80)), day('2026-09-03', bench(80)), day('2026-09-28', candidate)];
  const fine = bench(95);
  const jump = bench(100);
  expect(findJumps({ userId: 'ana', weeklyTargets: [], sessions: sessions(fine) }).has(fine.id)).toBe(false);
  expect(findJumps({ userId: 'ana', weeklyTargets: [], sessions: sessions(jump) }).has(jump.id)).toBe(true);
});

test('the baseline is the best going into the last 28 days, so a slow climb is not a jump', () => {
  const candidate = bench(100);
  // 28 days back from 09-28 is 08-31: the best going in is the 90 from 08-25, and 100 is only +11%
  const slow = man(83, day('2026-08-01', bench(80)), day('2026-08-03', bench(80)), day('2026-08-25', bench(90)), day('2026-09-28', candidate));
  expect(findJumps(slow).has(candidate.id)).toBe(false);
  // while 80 -> 100 with nothing between is checked against the 80
  const quick = bench(100);
  expect(findJumps(man(83, day('2026-08-01', bench(80)), day('2026-08-03', bench(80)), day('2026-09-28', quick))).has(quick.id)).toBe(true);
});

test('Warm-up Sets, Sets over 12 reps, Calibration Sets, Deload Session Sets and Custom Exercises are never jumps', () => {
  const calibrated = (candidate: ReturnType<typeof set>) => month(80, candidate);
  expect(findJumps(calibrated(bench(110, { label: 'warm-up' }))).size).toBe(0);
  expect(findJumps(calibrated(set('bench-press', 100, 13))).size).toBe(0);
  // Still in Calibration: the Exercise's second Session
  expect(findJumps(man(83, day('2026-09-01', bench(80)), day('2026-09-28', bench(100)))).size).toBe(0);
  const custom = (kg: number) => set('my-press', kg, 1, { custom: true });
  expect(findJumps(man(83, day('2026-09-01', custom(50)), day('2026-09-02', custom(50)), day('2026-09-28', custom(100)))).size).toBe(0);
  const deload = { ...day('2026-09-28', bench(100)), deload: true };
  expect(findJumps(man(83, day('2026-09-01', bench(80)), day('2026-09-03', bench(80)), deload)).size).toBe(0);
});

test('a Deload Session is not part of the baseline', () => {
  const deload = { ...day('2026-09-10', bench(200)), deload: true };
  const candidate = bench(100);
  expect(findJumps(man(83, day('2026-09-01', bench(80)), day('2026-09-03', bench(80)), deload, day('2026-09-28', candidate))).has(candidate.id)).toBe(true);
});

const records = (history: ReturnType<typeof man>) => deriveScoringEvents(history).filter((e): e is PersonalRecord => e.kind === 'personal-record');

test('a jump earns no Personal Record, becomes the best, and is what the next Session is checked against', () => {
  const jump = bench(100);
  const same = bench(100);
  const beat = bench(105);
  const history = man(
    83,
    day('2026-09-01', bench(80)),
    day('2026-09-03', bench(80)),
    day('2026-09-28', jump),
    day('2026-10-05', same),
    day('2026-10-12', beat),
  );
  // The returning lifter is asked once: 100 kg again a week later is not a jump
  expect([...findJumps(history).keys()]).toEqual([jump.id]);
  // No Personal Record for the jump nor for matching the new best, then a real one over it
  const events = records(history);
  expect(events.map((e) => e.setId)).toEqual([beat.id]);
  expect(events[0]!.previousE1rm).toBeCloseTo(e1rm1(100));
});

test('after a jump is saved, a Set in the same Session is checked against it, and earns only over it', () => {
  const first = bench(100);
  const second = set('bench-press', 100, 5);
  const history = man(83, day('2026-09-01', bench(80)), day('2026-09-03', bench(80)), day('2026-09-28', first, second));
  expect([...findJumps(history).keys()]).toEqual([first.id]);
  expect(records(history).map((e) => [e.setId, e.previousE1rm])).toEqual([[second.id, e1rm1(100)]]);
});

test('the rep PR track stays independent of a jump', () => {
  const higher = set('bench-press', 60, 18);
  const history = man(
    83,
    day('2026-09-01', bench(80), set('bench-press', 60, 15)),
    day('2026-09-03', bench(80)),
    day('2026-09-28', bench(100), higher),
  );
  expect(records(history).map((e) => e.setId)).toEqual([higher.id]);
});
