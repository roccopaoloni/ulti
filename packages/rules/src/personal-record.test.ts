import { expect, test } from 'vitest';
import { deriveScoringEvents as deriveAll, inCalibration, type Session } from './index.ts';

// Ana's Sets are numbered by Session so each Set has its own ID.
let next = 0;
const set = (exercise: string, weightKg: number, reps: number, extra: object = {}) => ({
  id: `set-${++next}`,
  exercise,
  custom: false,
  weightKg,
  reps,
  ...extra,
});
const session = (localDate: string, ...sets: ReturnType<typeof set>[]): Session => ({ localDate, sets });
const history = (...sessions: Session[]) => ({ userId: 'ana', sessions, weeklyTargets: [] });
// Only the Personal Records among the Scoring Events.
const deriveScoringEvents = (h: ReturnType<typeof history>) => deriveAll(h).filter((e) => e.kind === 'personal-record');

test("Ana's first two squat Sessions set her baseline, and her third beats it with a Personal Record", () => {
  const record = set('back-squat', 105, 6);
  const events = deriveScoringEvents(
    history(
      session('2026-10-05', set('back-squat', 100, 6)),
      session('2026-10-12', set('back-squat', 100, 6)),
      session('2026-10-19', record),
    ),
  );

  // Epley: 100 × (1 + 6/30) = 120 and 105 × (1 + 6/30) = 126, a 5% gain.
  expect(events).toEqual([
    expect.objectContaining({
      kind: 'personal-record',
      id: `ana:personal-record:${record.id}`,
      exercise: 'back-squat',
      localDate: '2026-10-19',
      previousE1rm: 120,
      newE1rm: 126,
      percentGain: 5,
      strengthLevelPercentile: 50,
      bodyweightKg: null,
      progressPoints: 110,
    }),
  ]);
});

const squat = (localDate: string, weightKg: number, reps: number, extra: object = {}) =>
  session(localDate, set('back-squat', weightKg, reps, extra));
const baseline = [squat('2026-10-05', 100, 6), squat('2026-10-12', 100, 6)];
const pointsOf = (...sessions: Session[]) => deriveScoringEvents(history(...baseline, ...sessions)).map((e) => e.progressPoints);

test('a heavier Set inside the first two Sessions earns nothing, however big the jump', () => {
  expect(deriveScoringEvents(history(squat('2026-10-05', 100, 6), squat('2026-10-12', 140, 6)))).toEqual([]);
});

test('a Set that only ties the best is not a Personal Record', () => {
  expect(pointsOf(squat('2026-10-19', 100, 6))).toEqual([]);
});

test('Sets of more than 12 reps never count, and do not raise the best either', () => {
  // 80 × 13 reps is an e1RM of 114.7, below her best anyway; 100 × 13 would be 143.3 and must not count.
  expect(pointsOf(squat('2026-10-19', 100, 13))).toEqual([]);
  expect(pointsOf(squat('2026-10-19', 100, 13), squat('2026-10-26', 105, 6))).toEqual([110]);
});

test('Sets of 1 to 12 reps can be Personal Records', () => {
  // 118 × 1 = 121.93 (a 1.6% gain) and 90 × 12 = 126 (a 5% gain), both above 120.
  expect(pointsOf(squat('2026-10-19', 118, 1))).toEqual([35]);
  expect(pointsOf(squat('2026-10-19', 90, 12))).toEqual([110]);
});

test('Custom Exercises never produce a Personal Record', () => {
  const plank = (localDate: string, weightKg: number) => session(localDate, set('custom-plank', weightKg, 6, { custom: true }));
  expect(deriveScoringEvents(history(plank('2026-10-05', 10), plank('2026-10-12', 10), plank('2026-10-19', 50)))).toEqual([]);
});

test('Warm-up Sets never produce a Personal Record', () => {
  // The lifter flagged her heavy Set as a Warm-up Set, so only the lighter Set counts.
  const flagged = session('2026-10-19', set('back-squat', 120, 6, { label: 'warm-up' }), set('back-squat', 100, 6));
  expect(pointsOf(flagged)).toEqual([]);
});

test('the best is all-time: after a long break she needs to beat the old best, not her recent one', () => {
  const afterBreak = [squat('2027-03-01', 80, 6), squat('2027-03-08', 95, 6), squat('2027-03-15', 105, 6)];
  expect(pointsOf(...afterBreak)).toEqual([110]);
});

test("each Exercise has its own baseline: a new Exercise's first Sessions do not earn", () => {
  const bench = (localDate: string, weightKg: number) => session(localDate, set('bench-press', weightKg, 5));
  const events = deriveScoringEvents(
    history(...baseline, bench('2026-10-13', 60), bench('2026-10-20', 80), squat('2026-10-21', 105, 6)),
  );
  expect(events.map((e) => [e.exercise, e.progressPoints])).toEqual([['back-squat', 110]]);
});

test("a ramp within one Session gives one Personal Record, from the pre-Session best to the Session's best Set, capped", () => {
  // 105, 110 and 115 × 6 each beat 120, but splitting a gain across Sets must not dodge the cap.
  const top = set('back-squat', 118, 6);
  const ramp = session('2026-10-19', set('back-squat', 105, 6), set('back-squat', 110, 6), set('back-squat', 115, 6), top);

  const events = deriveScoringEvents(history(...baseline, ramp));

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ setId: top.id, previousE1rm: 120, progressPoints: 150 });
  expect(events[0].newE1rm).toBeCloseTo(141.6);
});

test("the Session's best Set earns the record even when it was not the last one logged", () => {
  const top = set('back-squat', 110, 6);
  const events = deriveScoringEvents(history(...baseline, session('2026-10-19', top, set('back-squat', 105, 6))));

  expect(events.map((e) => e.setId)).toEqual([top.id]);
});

test('a single Personal Record is capped, so a typo cannot win the week', () => {
  // 100 × 6 = 120 to 118 × 6 = 141.6 is an 18% gain, worth 396 uncapped (a bigger one is a jump).
  expect(pointsOf(squat('2026-10-19', 118, 6))).toEqual([150]);
});

test('the same history derives the same events every time, and a later Session leaves earlier events alone', () => {
  const upTo = [...baseline, squat('2026-10-19', 105, 6)];
  const before = deriveScoringEvents(history(...upTo));

  expect(deriveScoringEvents(history(...upTo))).toEqual(before);
  expect(deriveScoringEvents(history(...upTo, squat('2026-10-26', 90, 6)))).toEqual(before);
});

test('an Exercise is in Calibration until it has been in two Sessions', () => {
  const sessions = [...baseline];
  expect(inCalibration(history(), 'back-squat')).toBe(true);
  expect(inCalibration(history(sessions[0]), 'back-squat')).toBe(true);
  expect(inCalibration(history(sessions[0], sessions[1]), 'back-squat')).toBe(true);
  expect(inCalibration(history(...sessions, squat('2026-10-19', 100, 6)), 'back-squat')).toBe(false);
});

// Rep PRs: Sets of more than 12 reps (calf raises, ab work), where e1RM overestimates.
const calf = (localDate: string, weightKg: number, reps: number, extra: object = {}) =>
  session(localDate, set('calf-raise', weightKg, reps, extra));
const calfBaseline = [calf('2026-10-05', 100, 19), calf('2026-10-12', 100, 19)];
const calfPointsOf = (...sessions: Session[]) => deriveScoringEvents(history(...calfBaseline, ...sessions)).map((e) => e.progressPoints);

test('100 kg × 19 then 100 kg × 20 on calf raise is a Personal Record', () => {
  const record = set('calf-raise', 100, 20);
  const events = deriveScoringEvents(history(...calfBaseline, session('2026-10-19', record)));
  // Epley: 100 × (1 + 19/30) = 163.33 and 100 × (1 + 20/30) = 166.67, a 2.04% gain.
  expect(events).toEqual([expect.objectContaining({ setId: record.id, exercise: 'calf-raise', percentGain: 2.04, progressPoints: 45 })]);
});

test('a lighter Set with more reps is not a rep PR', () => {
  expect(deriveScoringEvents(history(calf('2026-10-05', 60, 20), calf('2026-10-12', 60, 20), calf('2026-10-19', 50, 25)))).toEqual([]);
});

test('a heavier Set whose e1RM is lower is not a rep PR', () => {
  expect(calfPointsOf(calf('2026-10-19', 110, 13))).toEqual([]);
});

test('a heavier Set with more reps than any Set at that weight or heavier is a rep PR', () => {
  // 101 × 20 = 168.33 against 163.33, a 3.06% gain.
  expect(calfPointsOf(calf('2026-10-19', 101, 20))).toEqual([67]);
});

test('a best of 100 × 5 then 80 × 15 is not a Personal Record', () => {
  const fives = (date: string) => session(date, set('back-squat', 100, 5));
  expect(deriveScoringEvents(history(fives('2026-10-05'), fives('2026-10-12'), session('2026-10-19', set('back-squat', 80, 15))))).toEqual([]);
});

test('the first Set of more than 12 reps only sets the high-rep baseline', () => {
  const after5s = [squat('2026-10-05', 100, 5), squat('2026-10-12', 100, 5)];
  expect(deriveScoringEvents(history(...after5s, squat('2026-10-19', 80, 15)))).toEqual([]);
  expect(deriveScoringEvents(history(...after5s, squat('2026-10-19', 80, 15), squat('2026-10-26', 80, 16)))).toHaveLength(1);
});

test('Sets of more than 12 reps do not change how Sets of 1 to 12 reps score', () => {
  expect(pointsOf(squat('2026-10-19', 100, 13), squat('2026-10-26', 105, 6))).toEqual([110]);
});

test('Sets in Calibration earn nothing but set the high-rep baseline', () => {
  expect(deriveScoringEvents(history(calf('2026-10-05', 100, 19), calf('2026-10-12', 100, 25)))).toEqual([]);
  expect(deriveScoringEvents(history(calf('2026-10-05', 100, 19), calf('2026-10-12', 100, 25), calf('2026-10-19', 100, 26)))).toHaveLength(1);
});

test('Warm-up, Custom and Deload Sets never make a rep PR', () => {
  expect(calfPointsOf(calf('2026-10-19', 100, 25, { label: 'warm-up' }))).toEqual([]);
  const custom = (d: string, reps: number) => session(d, set('custom-calf', 100, reps, { custom: true }));
  expect(deriveScoringEvents(history(custom('2026-10-05', 19), custom('2026-10-12', 19), custom('2026-10-19', 25)))).toEqual([]);
  expect(calfPointsOf({ ...calf('2026-10-19', 100, 25), deload: true })).toEqual([]);
});

test('a rep PR earns at most the per-record cap', () => {
  expect(calfPointsOf(calf('2026-10-19', 200, 40))).toEqual([150]);
});
