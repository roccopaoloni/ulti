// Rank and Seasons (spec: Rank). Pure functions over Season Rank Points.
import type { ScoringEvent } from './index.ts';

export type Tier = 'bronze' | 'silver' | 'gold' | 'diamond' | 'elite';
// Divisions run from 5 (V, lowest) to 1 (I, highest); Elite has none.
export type Division = 1 | 2 | 3 | 4 | 5;
export type Rank = { tier: Tier; division: Division | null };

// The Season Rank Points at which each Tier's Division V starts, and how many points each Division
// of the Tier spans. Placeholders until the tuning ticket (#31), chosen from the design rule that a
// full Season of perfect consistency with no Personal Records tops out in Gold:
//   - A Season has at most 14 weeks that start in it (92 days, Monday to Sunday), and a perfect week
//     is CONSISTENCY_WEEKLY_AMOUNT = 120, so perfect consistency earns at most 14 * 120 = 1680
//     (13 * 120 = 1560 in the usual quarter).
//   - Gold I starts at 800 + 4 * 180 = 1520, within reach of 1560, so showing up every week reaches Gold I.
//   - Diamond V starts at 800 + 5 * 180 = 1700, above 1680, so Diamond needs Progress Points as well.
//   - Elite starts at 1700 + 5 * 260 = 3000: 1320 points beyond a perfect Season's 1680, over a
//     Season's worth of Personal Records at the placeholder curve.
export const TIER_CUTOFFS: { tier: Exclude<Tier, 'elite'>; start: number; divisionSpan: number }[] = [
  { tier: 'bronze', start: 0, divisionSpan: 60 },
  { tier: 'silver', start: 300, divisionSpan: 100 },
  { tier: 'gold', start: 800, divisionSpan: 180 },
  { tier: 'diamond', start: 1700, divisionSpan: 260 },
];
export const ELITE_CUTOFF = 3000;

const cutoffOf = (points: number) => [...TIER_CUTOFFS].reverse().find(({ start }) => points >= start) ?? TIER_CUTOFFS[0];

export function rankOf(seasonRankPoints: number): Rank {
  if (seasonRankPoints >= ELITE_CUTOFF) return { tier: 'elite', division: null };
  const tier = cutoffOf(seasonRankPoints);
  const steps = Math.floor((seasonRankPoints - tier.start) / tier.divisionSpan);
  return { tier: tier.tier, division: (5 - steps) as Division };
}

export type Season = { id: string; start: string; end: string };

// The calendar quarter a local date (YYYY-MM-DD) falls in.
export function seasonOf(localDate: string): Season {
  const year = localDate.slice(0, 4);
  const first = Math.floor((Number(localDate.slice(5, 7)) - 1) / 3) * 3 + 1;
  const pad = (month: number) => String(month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(Number(year), first + 2, 0)).getUTCDate();
  return { id: `${year}-Q${(first + 2) / 3}`, start: `${year}-${pad(first)}-01`, end: `${year}-${pad(first + 2)}-${lastDay}` };
}

// Season Rank Points: the starting points plus the Points the user's Scoring Events earned in the
// Season. A Consistency week belongs to the Season its Monday falls in. Points only ever add, so
// Rank only rises as the Season goes on.
export function seasonRankPoints(startingPoints: number, events: ScoringEvent[], season: Season): number {
  let total = startingPoints;
  for (const event of events) {
    const date = event.kind === 'consistency' ? event.week : event.localDate;
    if (date < season.start || date > season.end) continue;
    total += event.kind === 'consistency' ? event.consistencyPoints : event.progressPoints;
  }
  return total;
}

// The next Season's starting points from a final Tier: the cutoff of Division V of the Tier below it
// (a Bronze finish starts at 0).
export function startingPointsAfter(finalTier: Tier): number {
  const index = finalTier === 'elite' ? TIER_CUTOFFS.length : TIER_CUTOFFS.findIndex(({ tier }) => tier === finalTier);
  return TIER_CUTOFFS[Math.max(0, index - 1)].start;
}

// How far the user is to the next Division: the Rank it brings, the points still needed and the
// share of the current Division done. Null in Elite, which has no next.
export function rankProgress(seasonRankPoints: number) {
  if (seasonRankPoints >= ELITE_CUTOFF) return null;
  const tier = cutoffOf(seasonRankPoints);
  const steps = Math.floor((seasonRankPoints - tier.start) / tier.divisionSpan);
  const nextCutoff = tier.start + (steps + 1) * tier.divisionSpan;
  return {
    next: rankOf(nextCutoff),
    pointsToNext: nextCutoff - seasonRankPoints,
    fraction: (seasonRankPoints - (nextCutoff - tier.divisionSpan)) / tier.divisionSpan,
  };
}

// Elite users among this many of the Season's top positions see their position, others "top X%".
export const ELITE_POSITION_LIMIT = 1000;

export const showsPosition = (rank: Rank, position: number) => rank.tier === 'elite' && position <= ELITE_POSITION_LIMIT;
