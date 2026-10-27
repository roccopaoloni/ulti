import { expect, test } from 'vitest';
import { deriveScoringEvents, inCalibration, type Session } from './index.ts';

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
const history = (...sessions: Session[]) => ({ userId: 'ana', sessions });

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
      progressPoints: 50,
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
  expect(pointsOf(squat('2026-10-19', 100, 13), squat('2026-10-26', 105, 6))).toEqual([50]);
});

test('Sets of 1 to 12 reps can be Personal Records', () => {
  // 118 × 1 = 121.93 (a 1.6% gain) and 90 × 12 = 126 (a 5% gain), both above 120.
  expect(pointsOf(squat('2026-10-19', 118, 1))).toEqual([16]);
  expect(pointsOf(squat('2026-10-19', 90, 12))).toEqual([50]);
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
  expect(pointsOf(...afterBreak)).toEqual([50]);
});

test("each Exercise has its own baseline: a new Exercise's first Sessions do not earn", () => {
  const bench = (localDate: string, weightKg: number) => session(localDate, set('bench-press', weightKg, 5));
  const events = deriveScoringEvents(
    history(...baseline, bench('2026-10-13', 60), bench('2026-10-20', 80), squat('2026-10-21', 105, 6)),
  );
  expect(events.map((e) => [e.exercise, e.progressPoints])).toEqual([['back-squat', 50]]);
});

test("a ramp within one Session gives one Personal Record, from the pre-Session best to the Session's best Set, capped", () => {
  // 105, 110 and 120 × 6 each beat 120, but splitting a jump across Sets must not dodge the cap.
  const top = set('back-squat', 130, 6);
  const ramp = session('2026-10-19', set('back-squat', 105, 6), set('back-squat', 110, 6), set('back-squat', 120, 6), top);

  const events = deriveScoringEvents(history(...baseline, ramp));

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ setId: top.id, previousE1rm: 120, progressPoints: 100 });
  expect(events[0].newE1rm).toBeCloseTo(156);
});

test("the Session's best Set earns the record even when it was not the last one logged", () => {
  const top = set('back-squat', 110, 6);
  const events = deriveScoringEvents(history(...baseline, session('2026-10-19', top, set('back-squat', 105, 6))));

  expect(events.map((e) => e.setId)).toEqual([top.id]);
});

test('a single Personal Record is capped, so a typo cannot win the week', () => {
  // 100 × 6 = 120 to 200 × 6 = 240 is a 100% gain, worth 1000 uncapped.
  expect(pointsOf(squat('2026-10-19', 200, 6))).toEqual([100]);
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
