import { useEffect, useState, type CSSProperties } from 'react';
import { Badge } from './Badge.tsx';
import { Dots } from './Consistency.tsx';
import { initials, refreshBoard, refreshGroups, useBoard, useGroups, type BoardRow, type Group, type Period } from './groups.ts';
import { useI18n } from './i18n.ts';
import type { Exercise, Training } from './training.ts';

const periods: Period[] = ['week', 'month', 'year'];

// Fetches a Group's board for a Period now and whenever the phone comes back online. Offline, the
// board shows as last fetched.
function useFreshBoard(userId: string, groupId: string, period: Period) {
  const board = useBoard(userId, groupId, period);
  useEffect(() => {
    const refresh = () => refreshBoard(userId, groupId, period).catch(() => {});
    refresh();
    addEventListener('online', refresh);
    return () => removeEventListener('online', refresh);
  }, [userId, groupId, period]);
  return board;
}

function Crown() {
  const { t } = useI18n();
  return (
    <svg className="crown" viewBox="0 0 24 24" width="18" height="18" role="img" aria-label={t.groups.leader}>
      <path fill="currentColor" d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
    </svg>
  );
}

function BoardRowView({ row, nameOf }: { row: BoardRow; nameOf: (exercise: string) => string }) {
  const { t } = useI18n();
  const g = t.groups;
  return (
    <li className="board-row">
      <span className="board-pos">{row.position}</span>
      <span className="avatar" style={{ '--c': row.avatar_color } as CSSProperties} aria-hidden="true">
        {initials(row.display_name)}
      </span>
      <span className="board-main">
        <span className="member-name">
          {row.display_name}
          {row.me && <span className="muted"> · {g.you}</span>}
          {/* Boards stored before Ranks came with the board have none. */}
          {row.tier && <Badge rank={{ tier: row.tier, division: row.division }} tierName={t.rank.tier[row.tier]} mode="sm" />}
          {row.position === 1 && row.points > 0 && <Crown />}
        </span>
        {row.weekly_target ? <Dots done={row.session_dates.length} target={row.weekly_target} /> : null}
        {row.records.length > 0 && (
          <span className="stamps">
            {row.records.map((record, index) => (
              <span key={index} className="stamp">
                {nameOf(record.exercise)} +{Math.round(record.percent_gain)}%
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="disp board-points">{g.boardPoints(row.points)}</span>
    </li>
  );
}

// The Group's Week / Month / Year boards, ranked by Standard Points.
export function GroupBoard({ userId, group, training }: { userId: string; group: Group; training: Training | null }) {
  const { t, language } = useI18n();
  const [period, setPeriod] = useState<Period>('week');
  const board = useFreshBoard(userId, group.id, period);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  useEffect(() => {
    training?.exercises().then(setCatalog);
  }, [training]);
  const nameOf = (id: string) => {
    const exercise = catalog.find((candidate) => candidate.id === id);
    return exercise ? (language === 'es' ? exercise.nameEs : exercise.nameEn) : id;
  };
  return (
    <section className="card">
      <div className="chips">
        {periods.map((candidate) => (
          <button key={candidate} type="button" className="chip" aria-pressed={candidate === period} onClick={() => setPeriod(candidate)}>
            {t.groups.periods[candidate]}
          </button>
        ))}
      </div>
      {board && (
        <ul className="members">
          {board.members.map((row, index) => (
            <BoardRowView key={index} row={row} nameOf={nameOf} />
          ))}
        </ul>
      )}
    </section>
  );
}

// "2nd of 5, 40 pts behind Ana": where the user stands in the Group's week.
function RaceCard({ userId, group }: { userId: string; group: Group }) {
  const { t } = useI18n();
  const g = t.groups;
  const board = useFreshBoard(userId, group.id, 'week');
  const me = board?.members.find((row) => row.me);
  if (!board || !me) return null;
  const ahead = board.members.filter((row) => row.position < me.position).at(-1);
  const behind = board.members.find((row) => row.position > me.position);
  return (
    <section className="card">
      <div className="eyebrow">{group.name}</div>
      <p className="disp">{g.race(me.position, board.members.length)}</p>
      <p className="muted">
        {ahead ? g.behind(ahead.points - me.points, ahead.display_name) : behind ? g.ahead(me.points - behind.points, behind.display_name) : g.leading}
      </p>
    </section>
  );
}

// Home: one race card per Group.
export function RaceCards({ userId }: { userId: string }) {
  const groups = useGroups(userId);
  useEffect(() => {
    refreshGroups(userId).catch(() => {});
  }, [userId]);
  return (
    <>
      {groups?.map((group) => (
        <RaceCard key={group.id} userId={userId} group={group} />
      ))}
    </>
  );
}
