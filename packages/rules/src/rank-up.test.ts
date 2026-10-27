import { expect, test } from 'vitest';
import { rankUpMessage, rankUpOf, rankUpStatsOf, type ConsistencyWeek, type PersonalRecord, type RankUp, type RankUpStats } from './index.ts';

test('the first ever open has no last-seen Rank, so no Rank-up fires from nothing', () => {
  expect(rankUpOf(null, { tier: 'gold', division: 3 })).toBeNull();
});

test('a higher Tier is a Tier-up, a higher Division in the same Tier a Division-up', () => {
  const silverI = { tier: 'silver', division: 1 } as const;
  expect(rankUpOf({ tier: 'bronze', division: 1 }, silverI)).toEqual({ kind: 'tier', from: { tier: 'bronze', division: 1 }, to: silverI });
  expect(rankUpOf({ tier: 'silver', division: 3 }, silverI)).toEqual({ kind: 'division', from: { tier: 'silver', division: 3 }, to: silverI });
  expect(rankUpOf({ tier: 'diamond', division: 1 }, { tier: 'elite', division: null })?.kind).toBe('tier');
});

test('the same Rank, or a lower one after a new Season starts, is no Rank-up', () => {
  expect(rankUpOf({ tier: 'gold', division: 2 }, { tier: 'gold', division: 2 })).toBeNull();
  expect(rankUpOf({ tier: 'gold', division: 2 }, { tier: 'silver', division: 5 })).toBeNull();
  expect(rankUpOf({ tier: 'gold', division: 2 }, { tier: 'gold', division: 4 })).toBeNull();
});

const stats: RankUpStats = {
  weeks: 12, sessions: 31, prs: 6, streak: 9, points: 1540, consistency: 930, progress: 610, startTier: 'silver',
  best: { exercise: 'squat', percent: 12 },
  leads: { group: 'Los del gym' },
  passed: { names: ['Martin', 'Juli'] },
  eliteCount: 14,
};
const gold: RankUp = { kind: 'tier', from: { tier: 'silver', division: 1 }, to: { tier: 'gold', division: 5 } };
const quiet: RankUpStats = { weeks: 3, sessions: 9, prs: 1, streak: 1, points: 400, consistency: 300, progress: 100, startTier: 'bronze' };
const message = (over: Partial<Parameters<typeof rankUpMessage>[0]> = {}) =>
  rankUpMessage({ rankUp: gold, stats, recentHeadlines: [], lastKicker: null, roll: 0, ...over });
const elite: RankUp = { kind: 'tier', from: { tier: 'diamond', division: 1 }, to: { tier: 'elite', division: null } };

test('the headline is the most impressive true stat: Elite first, then leading a Group, a Streak, a lift', () => {
  expect(message({ rankUp: elite }).headline).toEqual({ id: 'elite', count: 14 });
  expect(message().headline).toEqual({ id: 'top', group: 'Los del gym' });
  expect(message({ stats: { ...stats, leads: undefined } }).headline).toEqual({ id: 'streak', weeks: 9 });
  expect(message({ stats: { ...stats, leads: undefined, streak: 7 } }).headline).toEqual({ id: 'best', exercise: 'squat', percent: 12 });
});

test('a headline is never written from a stat the user does not have', () => {
  const { eliteCount: _, ...noElite } = stats;
  expect(message({ rankUp: elite, stats: noElite }).headline.id).not.toBe('elite');
  expect(message({ stats: { ...quiet, startTier: 'gold' } }).headline).toEqual({ id: 'speed', from: 'silver', to: 'gold', weeks: 3 });
  const division: RankUp = { kind: 'division', from: { tier: 'gold', division: 5 }, to: { tier: 'gold', division: 4 } };
  expect(message({ stats: quiet, rankUp: division }).headline.id).toBe('showup');
});

test('a headline among the last three shown is passed over for the next best', () => {
  expect(message({ recentHeadlines: ['top'] }).headline.id).toBe('streak');
  const next = message({ recentHeadlines: ['top', 'streak', 'best'] });
  expect(next.headline.id).toBe('passed');
  expect(next.recentHeadlines).toEqual(['passed', 'top', 'streak']);
});

test('only the last three count: a headline shown four times ago can come back', () => {
  expect(message({ recentHeadlines: ['sessions', 'points', 'balanced', 'top'] }).headline.id).toBe('top');
});

test('the next-best stats become up to three chips, none repeating the headline or one another', () => {
  expect(message().chips).toEqual([
    { id: 'streak', weeks: 9 },
    { id: 'best', exercise: 'squat', percent: 12 },
    { id: 'prs', count: 6 },
  ]);
  expect(message({ stats: quiet }).chips).toEqual([{ id: 'weeks', weeks: 3 }, { id: 'sessions', sessions: 9 }, { id: 'points', points: 400 }]);
});

test('the kicker rotates and is never the same twice in a row; "Subiste de liga" only for a Tier-up', () => {
  const kickers = (rankUp: RankUp) => [0, 0.3, 0.6, 0.99].map((roll) => message({ rankUp, roll }).kicker);
  expect(kickers(gold)).toEqual(['charged', 'newRank', 'somethingElse', 'tierUp']);
  const division: RankUp = { kind: 'division', from: { tier: 'gold', division: 5 }, to: { tier: 'gold', division: 4 } };
  expect(kickers(division)).not.toContain('tierUp');
  for (const last of ['charged', 'newRank', 'somethingElse', 'tierUp'] as const) {
    for (const roll of [0, 0.2, 0.5, 0.8, 0.999]) expect(message({ lastKicker: last, roll }).kicker).not.toBe(last);
  }
});

test('Season stats are assembled from the Scoring Events of the Season only', () => {
  const week = (monday: string, trained: number, points: number) =>
    ({ kind: 'consistency', week: monday, trainedDates: Array(trained).fill(monday), consistencyPoints: points }) as unknown as ConsistencyWeek;
  const record = (localDate: string, exercise: string, percentGain: number, progressPoints: number) =>
    ({ kind: 'personal-record', localDate, exercise, percentGain, progressPoints }) as PersonalRecord;
  const stats = rankUpStatsOf({
    events: [record('2026-10-08', 'squat', 12.4, 100), record('2026-10-20', 'bench', 4, 50), record('2026-09-20', 'squat', 30, 400)],
    consistency: [week('2026-09-21', 3, 120), week('2026-10-05', 3, 120), week('2026-10-12', 2, 60)],
    today: '2026-10-27',
    streakWeeks: 2,
    nameOf: (id) => id.toUpperCase(),
  });
  expect(stats).toEqual({
    weeks: 4, sessions: 5, prs: 2, streak: 2, points: 330, consistency: 180, progress: 150, startTier: 'bronze',
    best: { exercise: 'SQUAT', percent: 12 },
  });
});

test('Season stats claim no best lift without a Personal Record', () => {
  const stats = rankUpStatsOf({ events: [], consistency: [], today: '2026-10-02', streakWeeks: 0, nameOf: (id) => id });
  expect(stats).toMatchObject({ weeks: 1, sessions: 0, prs: 0, points: 0 });
  expect(stats.best).toBeUndefined();
});
