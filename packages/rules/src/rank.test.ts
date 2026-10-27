import { expect, test } from 'vitest';
import { rankOf, rankProgress, seasonOf, showsPosition, seasonRankPoints, startingPointsAfter, type ConsistencyWeek, type PersonalRecord } from './index.ts';

test('Season Rank Points fall into a Tier and Division at the fixed cutoffs', () => {
  expect(rankOf(0)).toEqual({ tier: 'bronze', division: 5 });
  expect(rankOf(59)).toEqual({ tier: 'bronze', division: 5 });
  expect(rankOf(60)).toEqual({ tier: 'bronze', division: 4 });
  expect(rankOf(300)).toEqual({ tier: 'silver', division: 5 });
  expect(rankOf(1159)).toEqual({ tier: 'gold', division: 4 });
  expect(rankOf(1160)).toEqual({ tier: 'gold', division: 3 });
  expect(rankOf(1519)).toEqual({ tier: 'gold', division: 2 });
  expect(rankOf(1520)).toEqual({ tier: 'gold', division: 1 });
  expect(rankOf(1700)).toEqual({ tier: 'diamond', division: 5 });
});

test('Elite has no Divisions, however many points', () => {
  expect(rankOf(3000)).toEqual({ tier: 'elite', division: null });
  expect(rankOf(9000)).toEqual({ tier: 'elite', division: null });
});

test('Seasons are calendar quarters by local date', () => {
  expect(seasonOf('2026-10-27')).toEqual({ id: '2026-Q4', start: '2026-10-01', end: '2026-12-31' });
  expect(seasonOf('2026-01-01')).toEqual({ id: '2026-Q1', start: '2026-01-01', end: '2026-03-31' });
  expect(seasonOf('2026-03-31').id).toBe('2026-Q1');
  expect(seasonOf('2026-04-01')).toEqual({ id: '2026-Q2', start: '2026-04-01', end: '2026-06-30' });
  expect(seasonOf('2026-09-30')).toEqual({ id: '2026-Q3', start: '2026-07-01', end: '2026-09-30' });
});

test('Season Rank Points are the starting points plus the Points earned in the Season, and no others', () => {
  const consistency = (week: string, consistencyPoints: number) => ({ kind: 'consistency', week, consistencyPoints }) as ConsistencyWeek;
  const record = (localDate: string, progressPoints: number) => ({ kind: 'personal-record', localDate, progressPoints }) as PersonalRecord;
  const events = [
    consistency('2026-09-21', 120),
    consistency('2026-10-05', 80),
    record('2026-10-07', 35),
    record('2026-12-31', 10),
    record('2027-01-02', 99),
  ];

  expect(seasonRankPoints(0, events, seasonOf('2026-11-15'))).toBe(125);
  expect(seasonRankPoints(300, events, seasonOf('2026-11-15'))).toBe(425);
  expect(seasonRankPoints(0, [], seasonOf('2026-11-15'))).toBe(0);
});

test('Rank only rises as a Season goes on: each week adds to the Points and none take any away', () => {
  const week = (n: number): ConsistencyWeek => ({ kind: 'consistency', week: `2026-10-${String(5 + 7 * n).padStart(2, '0')}`, consistencyPoints: 120 }) as ConsistencyWeek;
  const ranks = [0, 1, 2, 3, 4].map((weeks) => rankOf(seasonRankPoints(0, [0, 1, 2, 3].slice(0, weeks).map(week), seasonOf('2026-10-27'))));

  // 0, 120, 240, 360, 480 points
  expect(ranks).toEqual([
    { tier: 'bronze', division: 5 },
    { tier: 'bronze', division: 3 },
    { tier: 'bronze', division: 1 },
    { tier: 'silver', division: 5 },
    { tier: 'silver', division: 4 },
  ]);
});

test('the next Season starts at the cutoff of Division V of the Tier below the final Tier', () => {
  expect(startingPointsAfter('bronze')).toBe(0);
  expect(startingPointsAfter('silver')).toBe(0);
  expect(startingPointsAfter('gold')).toBe(300);
  expect(startingPointsAfter('diamond')).toBe(800);
  expect(startingPointsAfter('elite')).toBe(1700);
});

test('progress to the next Division is the points still needed and the share of the Division done', () => {
  expect(rankProgress(90)).toEqual({ next: { tier: 'bronze', division: 3 }, pointsToNext: 30, fraction: 0.5 });
  expect(rankProgress(1500)).toEqual({ next: { tier: 'gold', division: 1 }, pointsToNext: 20, fraction: 160 / 180 });
  // Division I of a Tier is followed by Division V of the next.
  expect(rankProgress(1600)).toEqual({ next: { tier: 'diamond', division: 5 }, pointsToNext: 100, fraction: 80 / 180 });
  expect(rankProgress(2900)).toEqual({ next: { tier: 'elite', division: null }, pointsToNext: 100, fraction: 160 / 260 });
  expect(rankProgress(3500)).toBeNull();
});

test('only an Elite user among the Season top 1,000 sees a position instead of top X%', () => {
  expect(showsPosition(rankOf(3200), 7)).toBe(true);
  expect(showsPosition(rankOf(3200), 1000)).toBe(true);
  expect(showsPosition(rankOf(3200), 1001)).toBe(false);
  expect(showsPosition(rankOf(1600), 7)).toBe(false);
});
