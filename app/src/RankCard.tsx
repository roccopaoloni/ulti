import { rankOf, rankProgress, seasonOf, seasonRankPoints, showsPosition, type Rank } from '@ulti/rules';
import { useEffect, useState } from 'react';
import { supabase } from './auth.ts';
import { useI18n } from './i18n.ts';
import { today } from './profile.ts';
import type { Training } from './training.ts';

type Standing = { points: number; position: number | null; top_percent: number | null };

const roman = ['', 'I', 'II', 'III', 'IV', 'V'];

// Profile: the Rank in the current Season, the user's standing and the progress to the next Division.
// The Rank comes from the Scoring Events on this phone, so it is there offline; the standing comes
// from the server's read RPC, which returns only the caller's own numbers, and is left out offline.
// Online, the higher of the two decides the Rank: a new phone holds none of the user's history,
// and the server hasn't yet seen a Session logged offline.
export function RankCard({ training }: { training: Training }) {
  const { t } = useI18n();
  const r = t.rank;
  const [points, setPoints] = useState<number | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  useEffect(() => {
    const season = seasonOf(today());
    training.scoring().then(({ events, consistency }) => setPoints(seasonRankPoints(0, [...events, ...consistency], season)));
    supabase.rpc('season_standing', { on_date: today() }).then(
      ({ data }) => data && setStanding(data as Standing),
      () => {},
    );
  }, [training]);
  if (points === null) return null;
  const seasonPoints = Math.max(points, standing?.points ?? 0);
  const name = (rank: Rank) => (rank.division === null ? r.tier[rank.tier] : `${r.tier[rank.tier]} ${roman[rank.division]}`);
  const rank = rankOf(seasonPoints);
  const progress = rankProgress(seasonPoints);
  return (
    <section className="card">
      <div className="eyebrow">{r.title}</div>
      <p className="disp">{name(rank)}</p>
      {standing?.position != null && standing.top_percent != null && (
        <p className="muted">
          {showsPosition(rank, standing.position) ? r.position(standing.position) : r.topPercent(standing.top_percent)}
        </p>
      )}
      <p className="muted">{progress ? r.toNext(progress.pointsToNext, name(progress.next)) : r.maxed}</p>
    </section>
  );
}
