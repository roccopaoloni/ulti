import { expect, test } from 'vitest';
import { recommend, recommendStall, type Session, type TrainingHistory } from './index.ts';

// Bench Press with a Rep Range of 8–12, Increment 2.5 kg.
const bench = { repMin: 8, repMax: 12, incrementKg: 2.5 };

// A Session of one Exercise, its Sets given as [weightKg, reps], all one weight so all Working Sets.
function session(localDate: string, sets: [number, number][], exercise = 'bench-press', custom = false): Session {
  return {
    localDate,
    sets: sets.map(([weightKg, reps], index) => ({ id: `${localDate}-${index}`, exercise, custom, weightKg, reps })),
  };
}
const history = (...sessions: Session[]): TrainingHistory => ({ userId: 'ana', sessions, weeklyTargets: [] });

// A best Session, then lower ones.
const best = session('2026-10-01', [[60, 10], [60, 10]]);
const flat = (day: string) => session(`2026-10-${day}`, [[60, 9], [60, 9]]);

test('three Sessions in a row without beating the recent best e1RM is a Stall, reset about 10% lighter at the bottom of the range', () => {
  const ana = history(best, flat('05'), flat('08'), flat('11'));
  expect(recommendStall(ana, 'bench-press', bench)).toEqual({ weightKg: 55, reps: 8 });
});

test('two Sessions without beating the best is not yet a Stall', () => {
  expect(recommendStall(history(best, flat('05'), flat('08')), 'bench-press', bench)).toBeUndefined();
});

test('a Session that beats the recent best breaks the run', () => {
  const beat = session('2026-10-08', [[60, 11], [60, 11]]);
  expect(recommendStall(history(best, flat('05'), beat, flat('11')), 'bench-press', bench)).toBeUndefined();
});

test('equalling the recent best is not beating it', () => {
  const same = (day: string) => session(`2026-10-${day}`, [[60, 10]]);
  expect(recommendStall(history(best, same('05'), same('08'), same('11')), 'bench-press', bench)).toEqual({ weightKg: 55, reps: 8 });
});

test("a Session's e1RM is its best Working Set, so heavier with fewer reps can beat the best", () => {
  const heavier = session('2026-10-08', [[65, 8]]);
  expect(recommendStall(history(best, flat('05'), heavier, flat('11')), 'bench-press', bench)).toBeUndefined();
});

test('the recent best is the best of the 6 Sessions before, so an old peak is forgotten', () => {
  const peak = session('2026-09-01', [[80, 10]]);
  const flat60 = (day: string) => session(`2026-09-${day}`, [[60, 9]]);
  const slightly = (day: string) => session(`2026-10-${day}`, [[61, 9]]);
  // The peak is within 6 Sessions of the first of the last three, which all fall under it.
  expect(recommendStall(history(peak, flat60('02'), slightly('05'), slightly('08'), slightly('11')), 'bench-press', bench)).toEqual({ weightKg: 55, reps: 8 });
  // Six Sessions later the peak is forgotten: 61 kg beats the 60 kg baseline, so no Stall.
  const aged = [flat60('02'), flat60('04'), flat60('06'), flat60('08'), flat60('10'), flat60('12')];
  expect(recommendStall(history(peak, ...aged, slightly('05'), slightly('08'), slightly('11')), 'bench-press', bench)).toBeUndefined();
});

test('with no Session before the last three there is no recent best, so no Stall', () => {
  expect(recommendStall(history(flat('05'), flat('08'), flat('11')), 'bench-press', bench)).toBeUndefined();
});

test('missing the bottom of the Rep Range in two Sessions in a row is a Stall, even while e1RM improves', () => {
  const low = (day: string, weight: number) => session(`2026-10-${day}`, [[weight, 8], [weight, 7]]);
  expect(recommendStall(history(low('05', 62), low('08', 65)), 'bench-press', bench)).toEqual({ weightKg: 57.5, reps: 8 });
});

test('missing the bottom once, or in two Sessions with one met between, is not a Stall', () => {
  const miss = (day: string) => session(`2026-10-${day}`, [[60, 7]]);
  const met = session('2026-10-08', [[60, 8], [60, 9]]);
  expect(recommendStall(history(miss('05')), 'bench-press', bench)).toBeUndefined();
  expect(recommendStall(history(miss('05'), met, miss('11')), 'bench-press', bench)).toBeUndefined();
});

test('Warm-up Sets are ignored: a light first Set under the bottom of the range is not a miss', () => {
  const warm = (day: string) => session(`2026-10-${day}`, [[30, 5], [60, 9], [60, 9]]);
  expect(recommendStall(history(warm('05'), warm('08')), 'bench-press', bench)).toBeUndefined();
});

test("the reset weight is the last Session's training weight less 10%, rounded to the Increment", () => {
  expect(recommendStall(history(best, flat('05'), flat('08'), flat('11')), 'bench-press', { ...bench, incrementKg: 5 })).toEqual({ weightKg: 55, reps: 8 });
  const heavy = (day: string) => session(`2026-10-${day}`, [[102.5, 6]]);
  expect(recommendStall(history(heavy('05'), heavy('08')), 'bench-press', bench)).toEqual({ weightKg: 92.5, reps: 8 });
});

test('Custom Exercises and Exercises never done are never Stalled', () => {
  const custom = (day: string) => session(`2026-10-${day}`, [[60, 5]], 'my-lift', true);
  expect(recommendStall(history(custom('05'), custom('08')), 'my-lift', bench)).toBeUndefined();
  expect(recommendStall(history(), 'bench-press', bench)).toBeUndefined();
});

test('other Exercises in between do not count as Sessions of this one', () => {
  const squat = session('2026-10-06', [[100, 10]], 'back-squat');
  expect(recommendStall(history(best, flat('05'), squat, flat('08')), 'bench-press', bench)).toBeUndefined();
});

test('a Stall wins over going heavier when both would advise', () => {
  // Three Sessions at the top of the range (go heavier dismissed each time) under an earlier better one.
  const top = (day: string) => session(`2026-10-${day}`, [[60, 12], [60, 12]]);
  const peak = session('2026-10-01', [[65, 12]]);
  expect(recommend(history(peak, top('05'), top('08'), top('11')), 'bench-press', bench)).toEqual({ kind: 'stall', weightKg: 55, reps: 8 });
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

test('a bodyweight Exercise with no added weight and rising reps is not Stalled', () => {
  const ana = withBodyweight(80, ...[6, 7, 8, 9].map((reps, i) => pullUpSession(`2026-10-0${i + 1}`, [[0, reps]])));
  expect(recommendStall(ana, 'pull-up', pullUps)).toBeUndefined();
});

test('a weighted bodyweight Exercise that stops improving drops its added weight by 10% of the total load', () => {
  const flatPullUp = (day: string) => pullUpSession(`2026-10-${day}`, [[20, 8]]);
  const ana = withBodyweight(80, pullUpSession('2026-10-01', [[20, 9]]), flatPullUp('05'), flatPullUp('08'), flatPullUp('11'));
  // 10% of the 100 kg total load is 10 kg off the 20 kg added.
  expect(recommendStall(ana, 'pull-up', pullUps)).toEqual({ weightKg: 10, reps: 6 });
});

test('the added weight never drops below zero', () => {
  const miss = (day: string) => pullUpSession(`2026-10-${day}`, [[5, 5]]);
  expect(recommendStall(withBodyweight(80, miss('05'), miss('08')), 'pull-up', pullUps)).toEqual({ weightKg: 0, reps: 6 });
});

test('a bodyweight Exercise with no added weight has nothing to drop, so no Stall', () => {
  const miss = (day: string) => pullUpSession(`2026-10-${day}`, [[0, 4]]);
  expect(recommendStall(withBodyweight(80, miss('05'), miss('08')), 'pull-up', pullUps)).toBeUndefined();
});

test('without a bodyweight on record a bodyweight Exercise cannot be judged, so no Stall', () => {
  const flatPullUp = (day: string) => pullUpSession(`2026-10-${day}`, [[20, 8]]);
  const noBodyweight = history(pullUpSession('2026-10-01', [[20, 9]]), flatPullUp('05'), flatPullUp('08'), flatPullUp('11'));
  expect(recommendStall(noBodyweight, 'pull-up', pullUps)).toBeUndefined();
});
