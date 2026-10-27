import { kgToUnits } from '@ulti/rules';
import { useEffect, useState, type CSSProperties } from 'react';
import { Dots } from './Consistency.tsx';
import {
  fetchMemberProfile,
  initials,
  refreshBoard,
  refreshGroups,
  setScoringMode,
  useBoard,
  useGroups,
  type BoardRow,
  type Group,
  type MemberProfile,
  type Period,
  type ScoringMode,
} from './groups.ts';
import { useI18n } from './i18n.ts';
import { Info } from './Info.tsx';
import { useUnits } from './profile.ts';
import type { Exercise, Training } from './training.ts';

const periods: Period[] = ['week', 'month', 'year'];
const modes: ScoringMode[] = ['standard', 'prHunt', 'grind'];

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

function BoardRowView({ row, nameOf, onOpen }: { row: BoardRow; nameOf: (exercise: string) => string; onOpen: () => void }) {
  const { t } = useI18n();
  const g = t.groups;
  return (
    <li className="board-row" onClick={onOpen} style={{ cursor: 'pointer' }}>
      <span className="board-pos">{row.position}</span>
      <span className="avatar" style={{ '--c': row.avatar_color } as CSSProperties} aria-hidden="true">
        {initials(row.display_name)}
      </span>
      <span className="board-main">
        <button type="button" className="member-name btn-link" style={{ textAlign: 'start' }}>
          {row.display_name}
          {row.me && <span className="muted"> · {g.you}</span>}
          {row.position === 1 && row.points > 0 && <Crown />}
        </button>
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

// What a member's Visibility lets the viewer see of them. Weights are shown in the viewer's units.
function MemberProfileView({
  userId,
  groupId,
  memberId,
  period,
  nameOf,
  onClose,
}: {
  userId: string;
  groupId: string;
  memberId: string;
  period: Period;
  nameOf: (exercise: string) => string;
  onClose: () => void;
}) {
  const { t, formatNumber } = useI18n();
  const g = t.groups;
  const units = useUnits(userId) ?? 'kg';
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetchMemberProfile(groupId, memberId, period).then(setProfile, () => setFailed(true));
  }, [groupId, memberId, period]);
  const load = (weight_kg?: number, reps?: number) =>
    weight_kg === undefined ? '' : ` ${formatNumber(kgToUnits(weight_kg, units), 2)} ${units} × ${reps}`;
  return (
    <section className="card">
      <button type="button" className="btn-link" onClick={onClose}>
        {t.close}
      </button>
      {failed && <p className="error">{g.retry}</p>}
      {profile && (
        <>
          <p className="disp">
            {profile.position}. {profile.display_name} · {g.boardPoints(profile.points)}
          </p>
          <p className="muted">{g.memberSessions(profile.session_count)}</p>
          {profile.records.length > 0 && (
            <>
              <div className="eyebrow">{g.memberRecords}</div>
              <ul className="members">
                {profile.records.map((record, index) => (
                  <li key={index}>
                    {nameOf(record.exercise)} +{Math.round(record.percent_gain)}% · {g.boardPoints(record.points)}
                    {load(record.weight_kg, record.reps)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {profile.sessions && (
            <>
              <div className="eyebrow">{g.memberSessionList}</div>
              <ul className="members">
                {profile.sessions.map((session, index) => (
                  <li key={index}>
                    {session.local_date}
                    <ul>
                      {session.sets.map((set, setIndex) => (
                        <li key={setIndex}>
                          {nameOf(set.exercise)}
                          {load(set.weight_kg, set.reps)}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

// The Group's Week / Month / Year boards, ranked by Standard Points. Tapping a member opens their
// profile.
export function GroupBoard({ userId, group, training }: { userId: string; group: Group; training: Training | null }) {
  const { t, language } = useI18n();
  const [period, setPeriod] = useState<Period>('week');
  const board = useFreshBoard(userId, group.id, period);
  const [open, setOpen] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  useEffect(() => {
    training?.exercises().then(setCatalog);
  }, [training]);
  const nameOf = (id: string) => {
    const exercise = catalog.find((candidate) => candidate.id === id);
    return exercise ? (language === 'es' ? exercise.nameEs : exercise.nameEn) : id;
  };
  if (open) {
    return <MemberProfileView userId={userId} groupId={group.id} memberId={open} period={period} nameOf={nameOf} onClose={() => setOpen(null)} />;
  }
  const owner = group.members.some(({ me, owner }) => me && owner);
  const g = t.groups;
  const next = board?.next_scoring_mode;
  return (
    <section className="card">
      <div className="chips">
        {periods.map((candidate) => (
          <button key={candidate} type="button" className="chip" aria-pressed={candidate === period} onClick={() => setPeriod(candidate)}>
            {t.groups.periods[candidate]}
          </button>
        ))}
      </div>
      {board?.scoring_mode && (
        <p className="muted">
          {g.scoringMode(g.modes[board.scoring_mode])} <Info term="scoringMode" />
          {period !== 'year' && next && next !== board.scoring_mode && <> · {g.modeNext(g.modes[next], g.periods[period].toLowerCase())}</>}
        </p>
      )}
      {owner && period !== 'year' && (
        <div className="chips" role="group" aria-label={g.modeChoose}>
          {modes.map((mode) => (
            <button
              key={mode}
              type="button"
              className="chip"
              aria-pressed={mode === (next ?? board?.scoring_mode)}
              onClick={() =>
                setScoringMode(group.id, mode)
                  .then(() => refreshBoard(userId, group.id, period))
                  .catch(() => {})
              }
            >
              {g.modes[mode]}
            </button>
          ))}
        </div>
      )}
      {board && (
        <ul className="members">
          {board.members.map((row, index) => (
            <BoardRowView key={index} row={row} nameOf={nameOf} onOpen={() => setOpen(row.user_id)} />
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
