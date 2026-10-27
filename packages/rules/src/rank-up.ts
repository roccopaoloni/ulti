// The Rank-up moment (spec: Rank, design: The Rank-up moment). Pure: whether a Rank-up happened,
// and which headline, chips and kicker back it up.
import type { Rank, Tier } from './rank.ts';

const TIERS: Tier[] = ['bronze', 'silver', 'gold', 'diamond', 'elite'];

export type RankUp = { kind: 'tier' | 'division'; from: Rank; to: Rank };

// A Rank-up is a higher Division or Tier than the last Rank the user saw. With no last-seen Rank
// (the first ever open) there is none, and a lower Rank (a new Season starts lower) is not one.
export function rankUpOf(lastSeen: Rank | null, current: Rank): RankUp | null {
  if (!lastSeen) return null;
  const tierStep = TIERS.indexOf(current.tier) - TIERS.indexOf(lastSeen.tier);
  if (tierStep > 0) return { kind: 'tier', from: lastSeen, to: current };
  if (tierStep < 0 || current.division === null || lastSeen.division === null) return null;
  return current.division < lastSeen.division ? { kind: 'division', from: lastSeen, to: current } : null;
}

// The user's real numbers a Rank-up can be backed up with. What the phone can't know (leading a
// Group, passing someone, the Season's Elite count) is left out, and so is never claimed.
export type RankUpStats = {
  // Weeks of the Season so far, Sessions and Personal Records in it.
  weeks: number;
  sessions: number;
  prs: number;
  streak: number;
  points: number;
  consistency: number;
  progress: number;
  // The Tier the Season started in.
  startTier: Tier;
  best?: { exercise: string; percent: number };
  leads?: { group: string };
  passed?: { names: string[] };
  eliteCount?: number;
};

export type Headline =
  | { id: 'elite'; count: number }
  | { id: 'top'; group: string }
  | { id: 'streak'; weeks: number }
  | { id: 'best'; exercise: string; percent: number }
  | { id: 'passed'; name: string; more: number }
  | { id: 'prs'; count: number; weeks: number }
  | { id: 'climb'; from: Tier; to: Tier }
  | { id: 'speed'; from: Tier; to: Tier; weeks: number }
  | { id: 'showup'; sessions: number }
  | { id: 'sessions'; sessions: number }
  | { id: 'points'; points: number }
  | { id: 'balanced'; consistency: number; progress: number };
export type HeadlineId = Headline['id'];

export type Chip =
  | { id: 'top'; group: string }
  | { id: 'streak'; weeks: number }
  | { id: 'best'; exercise: string; percent: number }
  | { id: 'prs'; count: number }
  | { id: 'weeks'; weeks: number }
  | { id: 'sessions'; sessions: number }
  | { id: 'points'; points: number };

export type Kicker = 'charged' | 'newRank' | 'somethingElse' | 'tierUp';

// How many of the headlines last shown are passed over.
export const HEADLINE_MEMORY = 3;
// Consistency and Progress Points within this share of each other are an even split.
const BALANCED_SHARE = 0.1;

// The headline, chips and kicker for a Rank-up (design: The Rank-up moment). Every line is built
// from a stat the user has: the most impressive true one is the headline, unless it is one of the
// last three shown; the next-best stats become up to three chips. `roll` in [0, 1) picks the
// kicker, never the one shown last time. Language is left to the caller.
export function rankUpMessage(input: {
  rankUp: RankUp;
  stats: RankUpStats;
  recentHeadlines: readonly HeadlineId[];
  lastKicker: Kicker | null;
  roll: number;
}) {
  const { rankUp, stats, recentHeadlines, lastKicker, roll } = input;
  const to = rankUp.to.tier;
  const tierUp = rankUp.kind === 'tier';
  const candidates: { score: number; headline: Headline; chip?: Chip }[] = [];
  const add = (score: number, headline: Headline, chip?: Chip) => candidates.push({ score, headline, chip });
  if (to === 'elite' && stats.eliteCount !== undefined) add(0.97, { id: 'elite', count: stats.eliteCount });
  if (stats.leads) add(0.95, { id: 'top', group: stats.leads.group }, { id: 'top', group: stats.leads.group });
  if (stats.streak >= 8) add(0.9, { id: 'streak', weeks: stats.streak }, { id: 'streak', weeks: stats.streak });
  if (stats.best && stats.best.percent >= 10) add(0.8, { id: 'best', ...stats.best }, { id: 'best', ...stats.best });
  if (stats.passed?.names.length) add(0.7, { id: 'passed', name: stats.passed.names[0], more: stats.passed.names.length - 1 });
  if (stats.prs >= 3) add(0.6, { id: 'prs', count: stats.prs, weeks: stats.weeks }, { id: 'prs', count: stats.prs });
  if (tierUp && stats.startTier !== to) add(0.55, { id: 'climb', from: stats.startTier, to });
  if (tierUp) add(0.5, { id: 'speed', from: rankUp.from.tier, to, weeks: stats.weeks }, { id: 'weeks', weeks: stats.weeks });
  add(0.45, { id: 'showup', sessions: stats.sessions }, { id: 'sessions', sessions: stats.sessions });
  add(0.4, { id: 'sessions', sessions: stats.sessions }, { id: 'sessions', sessions: stats.sessions });
  add(0.35, { id: 'points', points: stats.points }, { id: 'points', points: stats.points });
  const larger = Math.max(stats.consistency, stats.progress);
  if (larger > 0 && Math.abs(stats.consistency - stats.progress) / larger <= BALANCED_SHARE) {
    add(0.3, { id: 'balanced', consistency: stats.consistency, progress: stats.progress });
  }
  candidates.sort((a, b) => b.score - a.score);

  const passedOver = recentHeadlines.slice(0, HEADLINE_MEMORY);
  const head = candidates.find(({ headline }) => !passedOver.includes(headline.id)) ?? candidates[candidates.length - 1];
  const chips: Chip[] = [];
  for (const { chip } of candidates) {
    if (!chip || chip.id === head.chip?.id || chips.some(({ id }) => id === chip.id)) continue;
    chips.push(chip);
    if (chips.length === 3) break;
  }

  const kickers: Kicker[] = ['charged', 'newRank', 'somethingElse'];
  if (tierUp) kickers.push('tierUp');
  const pool = kickers.filter((kicker) => kicker !== lastKicker);
  return {
    headline: head.headline,
    chips,
    kicker: pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))],
    recentHeadlines: [head.headline.id, ...recentHeadlines].slice(0, HEADLINE_MEMORY),
  };
}
