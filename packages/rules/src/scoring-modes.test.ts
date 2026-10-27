import { expect, test } from 'vitest';
import { deriveScoringEvents, scorePeriod, SCORING_MODES, type Session, type TrainingHistory } from './index.ts';

// Ana squats 100 × 6 twice (her baseline), then 105 × 6 on Monday 19 October: a Personal Record of
// 50 Progress Points. Two qualifying Sessions that week against a Weekly Target of 3 earn 80
// Consistency Points.
const sets = (localDate: string, weightKg: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `${localDate}-${i}`, exercise: 'back-squat', custom: false, weightKg, reps: 6 }));
const session = (localDate: string, weightKg: number, count = 6): Session => ({ localDate, sets: sets(localDate, weightKg, count) });
const ana: TrainingHistory = {
  userId: 'ana',
  sessions: [session('2026-10-05', 100), session('2026-10-12', 100), session('2026-10-19', 105), session('2026-10-21', 105)],
  weeklyTargets: [{ effectiveFrom: '2026-10-05', value: 3 }],
};

test('every Scoring Event stores one points value per Scoring Mode', () => {
  const events = deriveScoringEvents(ana);

  const record = events.find((event) => event.kind === 'personal-record')!;
  const week = events.find((event) => event.kind === 'consistency' && event.week === '2026-10-19')!;
  // Standard is both kinds of Points, PR Hunt only Progress Points, Grind only Consistency Points.
  expect(record.points).toEqual({ standard: 50, prHunt: 50, grind: 0 });
  expect(week.points).toEqual({ standard: 80, prHunt: 0, grind: 80 });
});

test("a Period's score is the plain sum of its events' points under the Mode", () => {
  const forWeek = deriveScoringEvents(ana).filter((event) => ('localDate' in event ? event.localDate : event.week) >= '2026-10-19');

  expect(SCORING_MODES).toEqual(['standard', 'prHunt', 'grind']);
  expect(scorePeriod(forWeek, 'standard')).toBe(130);
  expect(scorePeriod(forWeek, 'prHunt')).toBe(50);
  expect(scorePeriod(forWeek, 'grind')).toBe(80);
  expect(scorePeriod([], 'grind')).toBe(0);
});
