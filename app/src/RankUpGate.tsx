import { rankOf, rankUpMessage, rankUpOf, rankUpStatsOf, streak, type Chip, type Headline, type HeadlineId, type Kicker, type Rank, type RankUp } from '@ulti/rules';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n.ts';
import { today } from './profile.ts';
import { RankUpMoment, type RankUpChip } from './RankUp.tsx';
import { useSeasonStanding } from './season.ts';
import { write } from './stored.ts';
import type { Training } from './training.ts';

// What the user has seen of their Rank lives on this phone, like the language and the layout: the
// Rank they last saw here, and the headlines and kicker the moment last used. A Rank-up not yet
// seen on this phone is shown here. It doesn't sync: a new phone starts from the Rank it first
// opens at (no Rank-up from nothing), and the same Rank-up shown on two phones is the user's own.
const seenKey = (userId: string) => `ulti-rank-seen:${userId}`;
const headlinesKey = (userId: string) => `ulti-rank-up-headlines:${userId}`;
const kickerKey = (userId: string) => `ulti-rank-up-kicker:${userId}`;

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

const sameRank = (a: Rank | null, b: Rank) => a?.tier === b.tier && a.division === b.division;

type Moment = { rankUp: RankUp; kicker: Kicker; headline: Headline; chips: Chip[] };

// Shows the Rank-up on the next app open: once the Rank is known (the server has answered or
// failed to, so a new phone's empty history can't pass for a Rank), compare it with the Rank last
// seen here. The seen Rank moves up when the user taps Continue; if the Rank is lower (a new Season
// starts again from the bottom), the seen Rank follows it down, so the climb back is seen too.
export function RankUpGate({ userId, training }: { userId: string; training: Training }) {
  const { t, language } = useI18n();
  const { seasonPoints, scoring, settled } = useSeasonStanding(training);
  const [moment, setMoment] = useState<Moment | null>(null);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current || seasonPoints === null || scoring === null || !settled) return;
    decided.current = true;
    const current = rankOf(seasonPoints);
    const rankUp = rankUpOf(read<Rank>(seenKey(userId)), current);
    if (!rankUp) {
      if (!sameRank(read<Rank>(seenKey(userId)), current)) write(seenKey(userId), current);
      return;
    }
    training.exercises().then((catalog) => {
      const nameOf = (id: string) => {
        const exercise = catalog.find((candidate) => candidate.id === id);
        return exercise ? (language === 'es' ? exercise.nameEs : exercise.nameEn) : id;
      };
      const stats = rankUpStatsOf({ events: scoring.events, consistency: scoring.consistency, today: today(), streakWeeks: streak(scoring.consistency, today()), nameOf });
      const message = rankUpMessage({
        rankUp,
        stats,
        recentHeadlines: read<HeadlineId[]>(headlinesKey(userId)) ?? [],
        lastKicker: read<Kicker>(kickerKey(userId)),
        roll: Math.random(),
      });
      write(headlinesKey(userId), message.recentHeadlines);
      write(kickerKey(userId), message.kicker);
      setMoment({ rankUp, kicker: message.kicker, headline: message.headline, chips: message.chips });
    });
  }, [seasonPoints, scoring, settled, training, userId, language]);

  if (!moment) return null;
  const { rankUp } = moment;
  const r = t.rankUp;
  const tierName = (tier: Rank['tier']) => t.rank.tier[tier];
  // A chip counts up from zero: the number it ends on, and how the number is written.
  const counted = (chip: Chip): RankUpChip => {
    switch (chip.id) {
      case 'top': return { n: 0, format: () => r.chip(chip) };
      case 'streak': return { n: chip.weeks, format: (weeks) => r.chip({ ...chip, weeks }) };
      case 'weeks': return { n: chip.weeks, format: (weeks) => r.chip({ ...chip, weeks }) };
      case 'best': return { n: chip.percent, format: (percent) => r.chip({ ...chip, percent }) };
      case 'prs': return { n: chip.count, format: (count) => r.chip({ ...chip, count }) };
      case 'sessions': return { n: chip.sessions, format: (sessions) => r.chip({ ...chip, sessions }) };
      case 'points': return { n: chip.points, format: (points) => r.chip({ ...chip, points }) };
    }
  };
  return (
    <RankUpMoment
      from={rankUp.from}
      to={rankUp.to}
      tierName={tierName(rankUp.to.tier)}
      strings={{ news: r.news, tapHint: r.tapHint, continue: r.continue }}
      kicker={r.kicker[moment.kicker]}
      headline={r.headline(moment.headline, tierName)}
      chips={moment.chips.map(counted)}
      onContinue={() => {
        write(seenKey(userId), rankUp.to);
        setMoment(null);
      }}
    />
  );
}
