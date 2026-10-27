import { expect, test } from 'vitest';
import {
  deriveScoringEvents,
  inCalibration,
  recommendGoHeavier,
  recommendStall,
  streak,
  weekStamps,
  type Dated,
  type Session,
  type TrainingHistory,
} from './index.ts';

// A Session of `workingSets` equal-weight Sets of one Exercise, so every Set is a Working Set.
function session(localDate: string, workingSets = 6, exercise = 'back-squat', weightKg = 100, reps = 5): Session {
  return {
    localDate,
    sets: Array.from({ length: workingSets }, (_, i) => ({ id: `${localDate}-${exercise}-${i}`, exercise, custom: false, weightKg, reps })),
  };
}

const target3: Dated<number>[] = [{ effectiveFrom: '2026-10-05', value: 3 }];
const ana = (sessions: Session[], deloadWeeks: string[] = []): TrainingHistory => ({ userId: 'ana', sessions, weeklyTargets: target3, deloadWeeks });
const consistencyOf = (history: TrainingHistory) => deriveScoringEvents(history).filter((event) => event.kind === 'consistency');
const personalRecordsOf = (history: TrainingHistory) => deriveScoringEvents(history).filter((event) => event.kind === 'personal-record');

test('in a Deload Week a Session with three Working Sets qualifies; outside one it needs six', () => {
  const sessions = [session('2026-10-19', 3), session('2026-10-26', 3)];
  const events = consistencyOf(ana(sessions, ['2026-10-19']));
  expect(events.map((event) => [event.week, event.sessionDates])).toEqual([['2026-10-19', ['2026-10-19']]]);
});

test('in a Deload Week two Working Sets still do not qualify', () => {
  expect(consistencyOf(ana([session('2026-10-19', 2)], ['2026-10-19']))).toEqual([]);
});

test('a Deload Week that meets the Weekly Target earns a Week Stamp and extends the Streak like any other week', () => {
  const normal = [session('2026-10-12'), session('2026-10-14'), session('2026-10-16')];
  const deload = [session('2026-10-19', 3), session('2026-10-21', 3), session('2026-10-23', 3)];
  const events = consistencyOf(ana([...normal, ...deload], ['2026-10-19'])) as Parameters<typeof streak>[0];
  expect(weekStamps(events)).toEqual(['2026-10-12', '2026-10-19']);
  expect(streak(events, '2026-10-25')).toBe(2);
});

// --- Exclusions: Deload Week Sessions are ignored by Calibration, Personal Records, go heavier and Stall.

const bench = { repMin: 8, repMax: 12, incrementKg: 2.5 };
const benchSession = (localDate: string, weightKg: number, reps: number, count = 3) => session(localDate, count, 'bench-press', weightKg, reps);

test('a Deload Week Session does not count toward Calibration', () => {
  const sessions = [benchSession('2026-10-05', 60, 8), benchSession('2026-10-12', 54, 8), benchSession('2026-10-19', 65, 8), benchSession('2026-10-26', 70, 8)];
  // The 12th is a deload, so the 19th is still calibrating and only the 26th earns a record.
  expect(personalRecordsOf(ana(sessions, ['2026-10-12'])).map((event) => event.localDate)).toEqual(['2026-10-26']);
  // Without the Deload Week the 19th is already past Calibration.
  expect(personalRecordsOf(ana(sessions)).map((event) => event.localDate)).toEqual(['2026-10-19', '2026-10-26']);
});

test('a Deload Week Session neither sets the best nor earns a Personal Record', () => {
  const sessions = [benchSession('2026-10-05', 60, 8), benchSession('2026-10-07', 60, 8), benchSession('2026-10-19', 90, 8), benchSession('2026-10-26', 62.5, 8)];
  const records = personalRecordsOf(ana(sessions, ['2026-10-19']));
  expect(records.map((event) => event.localDate)).toEqual(['2026-10-26']);
  expect(records[0]!.previousE1rm).toBeCloseTo(60 * (1 + 8 / 30));
});

test('go heavier looks past a Deload Week Session', () => {
  const sessions = [benchSession('2026-10-12', 60, 12), benchSession('2026-10-19', 54, 12)];
  expect(recommendGoHeavier(ana(sessions, ['2026-10-19']), 'bench-press', bench)).toEqual({ weightKg: 62.5, reps: 8, incrementKg: 2.5 });
  expect(recommendGoHeavier(ana(sessions), 'bench-press', bench)).toEqual({ weightKg: 56.5, reps: 8, incrementKg: 2.5 });
});

test('a Deload Week Session neither completes nor breaks a Stall', () => {
  const best = benchSession('2026-10-01', 60, 10);
  const flat = (day: string) => benchSession(`2026-10-${day}`, 60, 9);
  const deload = benchSession('2026-10-12', 54, 9);
  // Two flat Sessions and a deload Session are not three flat Sessions.
  expect(recommendStall(ana([best, flat('05'), flat('08'), deload], ['2026-10-12']), 'bench-press', bench)).toBeUndefined();
  // A deload in the middle of three flat Sessions does not break the run.
  expect(recommendStall(ana([best, flat('05'), flat('08'), deload, flat('19')], ['2026-10-12']), 'bench-press', bench)).toEqual({ weightKg: 55, reps: 8 });
});

test('the app still says Calibration counting only non-deload Sessions', () => {
  const sessions = [benchSession('2026-10-05', 60, 8), benchSession('2026-10-12', 54, 8), benchSession('2026-10-19', 60, 8)];
  expect(inCalibration(ana(sessions, ['2026-10-12']), 'bench-press')).toBe(true);
  expect(inCalibration(ana([...sessions, benchSession('2026-10-26', 60, 8)], ['2026-10-12']), 'bench-press')).toBe(false);
});
