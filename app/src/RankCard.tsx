import { rankOf, rankProgress, showsPosition, type Rank, type Tier } from '@ulti/rules';
import type { CSSProperties } from 'react';
import { Badge } from './Badge.tsx';
import { useI18n } from './i18n.ts';
import { useSeasonStanding } from './season.ts';
import type { Training } from './training.ts';

const roman = ['', 'I', 'II', 'III', 'IV', 'V'];
const tiers: Tier[] = ['bronze', 'silver', 'gold', 'diamond', 'elite'];

// Profile: the Rank in the current Season, the user's standing and the progress to the next Division.
// The Rank comes from the Scoring Events on this phone, so it is there offline; the standing comes
// from the server's read RPC, which returns only the caller's own numbers, and is left out offline.
// Online, the higher of the two decides the Rank: a new phone holds none of the user's history,
// and the server hasn't yet seen a Session logged offline.
export function RankCard({ training }: { training: Training }) {
  const { t } = useI18n();
  const r = t.rank;
  const { seasonPoints, standing } = useSeasonStanding(training);
  if (seasonPoints === null) return null;
  const name = (rank: Rank) => (rank.division === null ? r.tier[rank.tier] : `${r.tier[rank.tier]} ${roman[rank.division]}`);
  const rank = rankOf(seasonPoints);
  const progress = rankProgress(seasonPoints);
  const tierIndex = tiers.indexOf(rank.tier);
  const hasStanding = standing?.position != null && standing.top_percent != null;
  const plaque = hasStanding
    ? showsPosition(rank, standing.position!)
      ? `#${standing.position}`
      : r.plaqueTopPercent(standing.top_percent!)
    : undefined;
  return (
    <section className="card" style={{ '--t': `var(--${rank.tier})` } as CSSProperties}>
      <div className="eyebrow">{r.title}</div>
      <div className="badge-lg">
        <Badge rank={rank} tierName={r.tier[rank.tier]} mode="lg" plaque={plaque} />
        <div>
          <p className="disp">{name(rank)}</p>
          {hasStanding && (
            <p className="muted">
              {showsPosition(rank, standing.position!) ? r.position(standing.position!) : r.topPercent(standing.top_percent!)}
            </p>
          )}
        </div>
      </div>
      {progress && (
        <div className="bar" role="progressbar" aria-label={r.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.fraction * 100)}>
          <i style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
        </div>
      )}
      <p className="muted">{progress ? r.toNext(progress.pointsToNext, name(progress.next)) : r.maxed}</p>
      <div className="shelf">
        {tiers.map((tier, index) => (
          <div key={tier} className={index > tierIndex ? 'locked' : undefined}>
            <Badge rank={{ tier, division: tier === 'elite' ? null : 5 }} tierName={r.tier[tier]} mode="still" />
            <span>{r.tier[tier]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
