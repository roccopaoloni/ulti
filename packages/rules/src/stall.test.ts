import { expect, test } from 'vitest';
import { recommend, recommendStall, type Session, type TrainingHistory } from './index.ts';

// Bench Press with a Rep Range of 8–12, Increment 2.5 kg.
const bench = { repMin: 8, repMax: 12, incrementKg: 2.5 };

// A Session of one Exercise, its Sets given as [weightKg, reps, rir?], all one weight so all Working Sets.
function session(localDate: string, sets: [number, number, number?][], exercise = 'bench-press', custom = false): Session {
  return {
    localDate,
    sets: sets.map(([weightKg, reps, rir], index) => ({ id: `${localDate}-${index}`, exercise, custom, weightKg, reps, rir })),
  };
}
const history = (...sessions: Session[]): TrainingHistory => ({ userId: 'ana', sessions, weeklyTargets: [] });
// The date `n` days after Thursday 1 October 2026.
const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10);

// The Calibration Sessions only set the baseline: the first two Sessions of an Exercise.
const calibration = [session('2026-09-26', [[50, 10]]), session('2026-09-28', [[55, 10]])];

// A best Session (an e1RM of 100 kg), then weekly ones under it.
const best = session(day(0), [[75, 10]]);
// ...a little under it (1.3%): flat, not Fatigue.
const under = (n: number) => session(day(n), [[74, 10]]);

test('Sessions not beating the best before over 3 weeks are a Stall: the next Rep Range, at RIR 2 from the best, rounded down', () => {
  const ana = history(...calibration, best, under(7), under(14), under(21), under(28));
  // 100 / (1 + (6 + 2) / 30) = 78.9, down to the 2.5 kg Increment.
  expect(recommendStall(ana, 'bench-press', bench)).toEqual({ weightKg: 77.5, reps: 6, repMin: 6, repMax: 8 });
});

test('3 Sessions over exactly 3 weeks (21 days, first to last) are a Stall; 20 days are not', () => {
  expect(recommendStall(history(...calibration, best, under(7), under(18), under(28)), 'bench-press', bench)).toEqual({
    weightKg: 77.5,
    reps: 6,
    repMin: 6,
    repMax: 8,
  });
  expect(recommendStall(history(...calibration, best, under(7), under(17), under(27)), 'bench-press', bench)).toBeUndefined();
});

test('3 Sessions in one week are not a Stall, however flat', () => {
  expect(recommendStall(history(...calibration, best, under(2), under(3), under(4), under(5)), 'bench-press', bench)).toBeUndefined();
});

test('a Session that beats the best before breaks the run', () => {
  const beat = session(day(14), [[75, 11]]);
  expect(recommendStall(history(...calibration, best, under(7), beat, under(21), under(28)), 'bench-press', bench)).toBeUndefined();
});

test('equalling the best before is not beating it', () => {
  const same = (n: number) => session(day(n), [[75, 10]]);
  expect(recommendStall(history(...calibration, best, same(7), same(14), same(21), same(28)), 'bench-press', bench)).toEqual({
    weightKg: 77.5,
    reps: 6,
    repMin: 6,
    repMax: 8,
  });
});

test("a Session's figure is its top Working Set, so heavier with fewer reps can beat the best", () => {
  const heavier = session(day(14), [[80, 8]]);
  expect(recommendStall(history(...calibration, best, under(7), heavier, under(21), under(28)), 'bench-press', bench)).toBeUndefined();
});

test('the Calibration Sessions only set the baseline: they are never in the run', () => {
  const same = (date: string) => session(date, [[60, 10]]);
  // Two Calibration Sessions and weekly Sessions after them: the run is the 3rd Session on.
  expect(recommendStall(history(same('2026-10-01'), same('2026-10-08'), same('2026-10-15'), same('2026-10-22'), same('2026-10-29')), 'bench-press', bench)).toBeUndefined();
  expect(recommendStall(history(same('2026-10-01'), same('2026-10-08'), same('2026-10-15'), same('2026-10-22'), same('2026-10-29'), same('2026-11-05')), 'bench-press', bench)).toEqual({
    weightKg: 62.5,
    reps: 6,
    repMin: 6,
    repMax: 8,
  });
});

test('the best before is only the up to 6 Sessions before, so an old peak is forgotten', () => {
  const peak = session(day(0), [[75, 12]]);
  // Each Session beats the one before it but stays under the peak.
  const climbing = (count: number) => Array.from({ length: count }, (_, i) => session(day(7 * (i + 1)), [[75 + i / 10, 11]]));
  // The peak is within sight of the first 6 Sessions after it: all fail to beat it.
  expect(recommendStall(history(...calibration, peak, ...climbing(6)), 'bench-press', bench)).toBeDefined();
  // The 7th is past the window, so it beats everything it can see and the run is broken.
  expect(recommendStall(history(...calibration, peak, ...climbing(7)), 'bench-press', bench)).toBeUndefined();
});

test('a Session at least 7.5% lighter starts a fresh window: the recent best is the new one, not the one before the drop', () => {
  const dropped = (n: number) => session(day(n), [[68, 10]]);
  const ana = history(...calibration, best, dropped(7), dropped(14), dropped(21), dropped(28), dropped(35));
  // 68 x 10 is an e1RM of 90.7 kg: 90.7 / (1 + 8/30) = 71.6, down to 70. The 100 kg best before the drop is not counted.
  expect(recommendStall(ana, 'bench-press', bench)).toEqual({ weightKg: 70, reps: 6, repMin: 6, repMax: 8 });
});

test('with RIR logged on both Sessions the figure is RIR-adjusted: more reserve at the same weight beats the best', () => {
  const hard = session(day(0), [[60, 10, 0]]);
  const easier = (n: number) => session(day(n), [[60, 10, 2]]);
  // On plain e1RM all four are equal and it is a Stall; adjusted, the first beats the best and the run is only 2 weeks.
  expect(recommendStall(history(...calibration, hard, easier(7), easier(14), easier(21), easier(28)), 'bench-press', bench)).toBeUndefined();
});

test('RIR is only used when both Sessions logged it', () => {
  const hard = session(day(0), [[60, 10]]);
  const easier = (n: number) => session(day(n), [[60, 10, 2]]);
  expect(recommendStall(history(...calibration, hard, easier(7), easier(14), easier(21), easier(28)), 'bench-press', bench)).toBeDefined();
});

test('Sets over 12 reps are not judged, and an Exercise trained only above 12 reps has no Stall', () => {
  const high = (n: number) => session(day(n), [[40, 15]]);
  expect(recommendStall(history(...calibration, high(0), high(7), high(14), high(21)), 'bench-press', bench)).toBeUndefined();
});

test('Deload Sessions are ignored', () => {
  const deload = (n: number): Session => ({ ...session(day(n), [[40, 10]]), deload: true });
  expect(recommendStall(history(...calibration, best, deload(7), deload(14), deload(21)), 'bench-press', bench)).toBeUndefined();
});

test('the Rep Range moves one bracket by its midpoint: down from 8 or more, up below 8, never past 10–12', () => {
  const ana = history(...calibration, best, under(7), under(14), under(21), under(28));
  const shift = (repMin: number, repMax: number) => {
    const advice = recommendStall(ana, 'bench-press', { repMin, repMax, incrementKg: 2.5 });
    return advice && [advice.repMin, advice.repMax, advice.weightKg, advice.reps];
  };
  expect(shift(8, 12)).toEqual([6, 8, 77.5, 6]);
  expect(shift(5, 6)).toEqual([6, 8, 77.5, 6]);
  expect(shift(10, 12)).toEqual([8, 10, 75, 8]);
  expect(shift(6, 8)).toEqual([8, 10, 75, 8]);
  expect(shift(4, 6)).toEqual([6, 8, 77.5, 6]);
  expect(shift(8, 10)).toEqual([6, 8, 77.5, 6]);
  expect(shift(6, 12)).toEqual([6, 8, 77.5, 6]);
  expect(shift(3, 5)).toEqual([6, 8, 77.5, 6]);
});

test('the weight is rounded down to the Increment, whatever it is', () => {
  const ana = history(...calibration, best, under(7), under(14), under(21), under(28));
  expect(recommendStall(ana, 'bench-press', { ...bench, incrementKg: 5 })?.weightKg).toBe(75);
  expect(recommendStall(ana, 'bench-press', { ...bench, incrementKg: 1.25 })?.weightKg).toBe(78.75);
});

test('Warm-up Sets are ignored: a light first Set is not a Working Set to judge', () => {
  const warm = (n: number) => session(day(n), [[30, 5], [74, 10]]);
  expect(recommendStall(history(...calibration, best, warm(7), warm(14), warm(21), warm(28)), 'bench-press', bench)).toBeDefined();
  const lightOnly = (n: number) => session(day(n), [[30, 5], [70, 10], [70, 10]]);
  expect(recommendStall(history(lightOnly(0), lightOnly(7)), 'bench-press', bench)).toBeUndefined();
});

test('Custom Exercises and Exercises never done are never Stalled', () => {
  const custom = (n: number) => session(day(n), [[60, 5]], 'my-lift', true);
  expect(recommendStall(history(custom(0), custom(7), custom(14), custom(21), custom(28)), 'my-lift', bench)).toBeUndefined();
  expect(recommendStall(history(), 'bench-press', bench)).toBeUndefined();
});

test('other Exercises in between do not count as Sessions of this one', () => {
  const squat = session(day(10), [[100, 10]], 'back-squat');
  expect(recommendStall(history(...calibration, best, under(7), squat, under(14)), 'bench-press', bench)).toBeUndefined();
});

test('a Stall wins over going heavier when both would advise', () => {
  // Sessions at the top of the range (go heavier dismissed each time) under an earlier better one.
  const top = (n: number) => session(day(n), [[64, 12], [64, 12]]);
  const peak = session(day(0), [[65, 12]]);
  expect(recommend(history(...calibration, peak, top(7), top(14), top(21), top(28)), 'bench-press', bench)).toEqual({
    kind: 'stall',
    weightKg: 70,
    reps: 6,
    repMin: 6,
    repMax: 8,
  });
});

test('Fatigue wins over a Stall', () => {
  // Three Sessions 5% under the best, over 3 weeks: both Fatigue and a Stall.
  const weak = (n: number) => session(day(n), [[71, 10]]);
  expect(recommend(history(...calibration, best, weak(7), weak(14), weak(21)), 'bench-press', bench)).toMatchObject({ kind: 'fatigue' });
});

test('with no Stall, the recommendation is to go heavier; with neither, none', () => {
  const top = session('2026-10-19', [[60, 12], [60, 12]]);
  expect(recommend(history(top), 'bench-press', bench)).toEqual({ kind: 'goHeavier', weightKg: 62.5, reps: 8, incrementKg: 2.5 });
  expect(recommend(history(session('2026-10-19', [[60, 10]])), 'bench-press', bench)).toBeUndefined();
});

// Pull-ups: weightKg is the weight added to Ana's 80 kg bodyweight (0 for a plain pull-up).
const pullUps = { repMin: 6, repMax: 10, incrementKg: 2.5 };
const pullUpSession = (localDate: string, sets: [number, number][]): Session => ({
  localDate,
  sets: sets.map(([weightKg, reps], index) => ({ id: `${localDate}-${index}`, exercise: 'pull-up', custom: false, bodyweight: true, weightKg, reps })),
});
const withBodyweight = (kg: number, ...sessions: Session[]): TrainingHistory => ({
  ...history(...sessions),
  profile: { sex: [], bodyweightKg: [{ effectiveFrom: '2026-01-01', value: kg }] },
});
// Two Calibration Sessions of pull-ups.
const pullUpCalibration = [pullUpSession('2026-09-26', [[5, 8]]), pullUpSession('2026-09-28', [[5, 8]])];

test('a bodyweight Exercise with rising reps is not Stalled', () => {
  const ana = withBodyweight(80, pullUpSession('2026-09-26', [[0, 4]]), pullUpSession('2026-09-28', [[0, 5]]), ...[6, 7, 8, 9, 10].map((reps, i) => pullUpSession(day(7 * i), [[0, reps]])));
  expect(recommendStall(ana, 'pull-up', pullUps)).toBeUndefined();
});

test('a weighted bodyweight Exercise that stops improving works on bodyweight plus the added weight', () => {
  const flatPullUp = (n: number) => pullUpSession(day(n), [[20, 8]]);
  const ana = withBodyweight(80, ...pullUpCalibration, pullUpSession(day(0), [[20, 9]]), flatPullUp(7), flatPullUp(14), flatPullUp(21), flatPullUp(28));
  // Best: 100 kg x 9 = 130 kg e1RM. To 4–6: 130 / (1 + 6/30) = 108.3 kg in all, 28.3 added, down to 27.5.
  expect(recommendStall(ana, 'pull-up', pullUps)).toEqual({ weightKg: 27.5, reps: 4, repMin: 4, repMax: 6 });
});

test('a bodyweight Exercise with no added weight can be Stalled too', () => {
  const plain = (n: number) => pullUpSession(day(n), [[0, 12]]);
  const ana = withBodyweight(80, ...pullUpCalibration, plain(0), plain(7), plain(14), plain(21), plain(28));
  // Best: 80 kg x 12 = 112 kg. To 8–10: 112 / (1 + 10/30) = 84 kg in all, 4 added, down to 2.5.
  expect(recommendStall(ana, 'pull-up', { repMin: 10, repMax: 12, incrementKg: 2.5 })).toEqual({ weightKg: 2.5, reps: 8, repMin: 8, repMax: 10 });
});

test('without a bodyweight on record a bodyweight Exercise cannot be judged, so no Stall', () => {
  const flatPullUp = (n: number) => pullUpSession(day(n), [[20, 8]]);
  const noBodyweight = history(...pullUpCalibration, pullUpSession(day(0), [[20, 9]]), flatPullUp(7), flatPullUp(14), flatPullUp(21), flatPullUp(28));
  expect(recommendStall(noBodyweight, 'pull-up', pullUps)).toBeUndefined();
});
