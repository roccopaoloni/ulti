import { kgToUnits } from '@ulti/rules';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Badge } from './Badge.tsx';
import { Dots } from './Consistency.tsx';
import {
  fetchMemberProfile,
  initials,
  markVisit,
  memberPath,
  periodFromSearch,
  refreshBoard,
  refreshGroups,
  refreshNews,
  selectGroup,
  setScoringMode,
  useBoard,
  useAllNews,
  useGroups,
  useNews,
  type BoardRow,
  type Group,
  type MemberProfile,
  type News,
  type Period,
  type ScoringMode,
} from './groups.ts';
import { useI18n, type I18n } from './i18n.ts';
import { Info } from './Info.tsx';
import { chevronIcon, trophyIcon } from './icons.tsx';
import { navigate, paths } from './navigation.ts';
import { useUnits } from './profile.ts';
import { Skeleton } from './Skeleton.tsx';
import { SubScreen } from './SubScreen.tsx';
import type { Exercise, Training } from './training.ts';

const periods: Period[] = ['week', 'month', 'year'];
const modes: ScoringMode[] = ['standard', 'prHunt', 'grind'];

// Fetches a Group's board for a Period now and whenever the phone comes back online. Offline, the
// board shows as last fetched.
export function useFreshBoard(userId: string, groupId: string, period: Period) {
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
  const { t, formatNumber } = useI18n();
  const g = t.groups;
  // The records come newest first; the row shows the latest one.
  const record = row.records[0];
  return (
    <li className={`board-row${row.owner || record ? '' : ' no-meta'}`} onClick={row.former ? undefined : onOpen} style={{ cursor: row.former ? 'default' : 'pointer' }}>
      <span className="board-pos">{row.position}</span>
      <span className="avatar" style={{ '--c': row.avatar_color } as CSSProperties} aria-hidden="true">
        {initials(row.display_name)}
        {/* Boards stored before Ranks came with the board have none. */}
        {row.tier && <Badge rank={{ tier: row.tier, division: row.division }} tierName={t.rank.tier[row.tier]} mode="sm" />}
      </span>
      <button type="button" className="board-name-line btn-link">
        <span className="board-name">{row.former ? g.formerMember : row.display_name}</span>
        {row.me && <span className="tagpill you">{g.you}</span>}
        {row.position === 1 && row.points > 0 && <Crown />}
      </button>
      {(row.owner || record) && (
        <span className="board-meta">
          {row.owner && <span className="tagpill">{t.glossary.owner.term}</span>}
          {record && (
            <span className="stamp board-stamp">
              {nameOf(record.exercise)} +{Math.round(record.percent_gain)}%
            </span>
          )}
        </span>
      )}
      <span className="board-end">
        <span className="board-points">
          {formatNumber(row.points)}
          <span className="board-unit">{g.pointsUnit}</span>
        </span>
        {row.weekly_target ? <Dots done={row.session_dates.length} target={row.weekly_target} /> : null}
      </span>
      {!row.former && <span className="chevron">{chevronIcon}</span>}
    </li>
  );
}

// Names an Exercise in the user's language, from the catalog on the phone.
function useExerciseName(training: Training | null) {
  const { language } = useI18n();
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  useEffect(() => {
    training?.exercises().then(setCatalog);
  }, [training]);
  return (id: string) => {
    const exercise = catalog.find((candidate) => candidate.id === id);
    return exercise ? (language === 'es' ? exercise.nameEs : exercise.nameEn) : id;
  };
}

// A member's profile, a screen of its own (its URL has the Group, the member and the Period). Its
// Week / Month / Year switch starts on the Period the board had open. What shows of the member is
// what their Visibility lets the viewer see; weights are in the viewer's units.
export function MemberProfileScreen({ userId, training, groupId, memberId }: { userId: string; training: Training | null; groupId: string; memberId: string }) {
  const { t, language, formatNumber } = useI18n();
  const g = t.groups;
  const units = useUnits(userId) ?? 'kg';
  const nameOf = useExerciseName(training);
  const group = useGroups(userId)?.find(({ id }) => id === groupId);
  const [period, setPeriod] = useState<Period>(() => periodFromSearch(location.search));
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    refreshGroups(userId).catch(() => {});
  }, [userId]);
  useEffect(() => {
    setProfile(null);
    setFailed(false);
    fetchMemberProfile(groupId, memberId, period).then(setProfile, () => setFailed(true));
  }, [groupId, memberId, period]);
  // The URL follows the switch, so a reload reopens the same Period.
  const choose = (next: Period) => {
    history.replaceState(history.state, '', memberPath(groupId, memberId, next));
    setPeriod(next);
  };
  const load = (weight_kg?: number, reps?: number) =>
    weight_kg === undefined ? '' : `${formatNumber(kgToUnits(weight_kg, units), 2)} ${units} × ${reps}`;
  const date = (localDate: string) => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(localDate));
  return (
    <SubScreen title={group?.name ?? ''} parent={paths.groups}>
      <section className="card">
        {failed && <p className="error">{g.retry}</p>}
        {profile && (
          <div className="badge-lg member-top">
            {profile.tier && <Badge rank={{ tier: profile.tier, division: profile.division }} tierName={t.rank.tier[profile.tier]} mode="lg" />}
            <div>
              <p className="disp">{profile.display_name}</p>
              <p className="muted">
                #{profile.position} · {g.boardPoints(profile.points)} · {g.memberSessions(profile.session_count)}
              </p>
            </div>
          </div>
        )}
        <div className="chips">
          {periods.map((candidate) => (
            <button key={candidate} type="button" className="chip" aria-pressed={candidate === period} onClick={() => choose(candidate)}>
              {g.periods[candidate]}
            </button>
          ))}
        </div>
      </section>
      {profile && profile.records.length > 0 && (
        <section className="card">
          <div className="eyebrow">{g.memberRecords}</div>
          <ul className="profile-rows">
            {profile.records.map((record, index) => (
              <li key={index} className="profile-row">
                <span className="profile-name">{trophyIcon}{nameOf(record.exercise)}</span>
                <span className="profile-end">
                  <span className="stamp">+{Math.round(record.percent_gain)}%</span>
                  <span className="disp">{g.boardPoints(record.points)}</span>
                </span>
                {record.weight_kg !== undefined && <span className="muted profile-load">{load(record.weight_kg, record.reps)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {profile?.sessions?.map((session, index) => (
        <section key={index} className="card">
          <strong>{date(session.local_date)}</strong>
          <ul className="profile-rows">
            {session.sets.map((set, setIndex) => (
              <li key={setIndex} className="profile-row">
                <span className="profile-name">{nameOf(set.exercise)}</span>
                {set.weight_kg !== undefined && <span className="muted">{load(set.weight_kg, set.reps)}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </SubScreen>
  );
}

// The Group's Week / Month / Year boards, ranked by Standard Points. Tapping a member opens their
// profile.
export function GroupBoard({ userId, group, training }: { userId: string; group: Group; training: Training | null }) {
  const { t } = useI18n();
  // The Period is in the URL, so Back from a member's profile returns to the same one.
  const [period, setPeriod] = useState<Period>(() => periodFromSearch(location.search));
  const board = useFreshBoard(userId, group.id, period);
  const nameOf = useExerciseName(training);
  const choose = (next: Period) => {
    history.replaceState(history.state, '', `${paths.groups}?period=${next}`);
    setPeriod(next);
  };
  const g = t.groups;
  const next = board?.next_scoring_mode;
  return (
    <section className="card">
      <div className="period-tabs">
        {periods.map((candidate) => (
          <button key={candidate} type="button" aria-pressed={candidate === period} onClick={() => choose(candidate)}>
            {t.groups.periods[candidate]}
          </button>
        ))}
      </div>
      {board?.scoring_mode && (
        <p className="muted board-mode">
          {g.scoringMode(g.modes[board.scoring_mode])} <Info term="scoringMode" />
          {period !== 'year' && next && next !== board.scoring_mode && <> · {g.modeNext(g.modes[next], g.periods[period].toLowerCase())}</>}
        </p>
      )}
      {!board && <Skeleton bars={['100%', '100%', '100%', '100%']} />}
      {board && (
        <ul className="members">
          {board.members.map((row, index) => (
            <BoardRowView key={index} row={row} nameOf={nameOf} onOpen={() => navigate(memberPath(group.id, row.user_id, period))} />
          ))}
        </ul>
      )}
    </section>
  );
}

// In Group settings, the Owner's choice of Scoring Mode (the board shows the one in use).
export function ScoringModeChoice({ userId, group }: { userId: string; group: Group }) {
  const { t } = useI18n();
  const g = t.groups;
  const board = useFreshBoard(userId, group.id, 'week');
  const next = board?.next_scoring_mode ?? board?.scoring_mode;
  return (
    <section className="card">
      <div className="eyebrow">
        {t.glossary.scoringMode.term} <Info term="scoringMode" />
      </div>
      <div className="chips" role="group" aria-label={g.modeChoose}>
        {modes.map((mode) => (
          <button
            key={mode}
            type="button"
            className="chip"
            aria-pressed={mode === next}
            onClick={() =>
              setScoringMode(group.id, mode)
                .then(() => refreshBoard(userId, group.id, 'week'))
                .catch(() => {})
            }
          >
            {g.modes[mode]}
          </button>
        ))}
      </div>
      <p className="muted">{g.modeHint}</p>
    </section>
  );
}

// "Bea passed Ana (You)": a Group's passes, the ones involving the user first, at most three.
function passLines(news: News | null, g: I18n['t']['groups']) {
  const label = (who: { display_name: string; me: boolean }) => (who.me ? `${who.display_name} (${g.you})` : who.display_name);
  const passes = [...(news?.passes ?? [])].sort((a, b) => Number(b.passer.me || b.passed.me) - Number(a.passer.me || a.passed.me));
  return passes.slice(0, 3).map((pass) => g.passed(label(pass.passer), label(pass.passed)));
}

// One page of the Groups panel: the Group's name, where the user stands in its week, and its news
// since the last visit. Tapping it opens the Group on the Groups tab's Week board.
function GroupPage({ userId, group, hasNews }: { userId: string; group: Group; hasNews: boolean }) {
  const { t } = useI18n();
  const g = t.groups;
  const board = useFreshBoard(userId, group.id, 'week');
  const lines = passLines(useNews(userId, group.id), g);
  const me = board?.members.find((row) => row.me);
  const ahead = me && board?.members.filter((row) => row.position < me.position).at(-1);
  const behind = me && board?.members.find((row) => row.position > me.position);
  const open = () => {
    selectGroup(group.id);
    navigate(paths.groups);
  };
  return (
    <div className="gpage" role="group" aria-roledescription="slide" aria-label={group.name}>
      <button type="button" className="gpage-link" onClick={open}>
        <span className="gpage-head">
          <span className="gname">
            {group.name}
            {hasNews && <span className="newsdot" aria-hidden="true" />}
          </span>
          <span className="chevron">{chevronIcon}</span>
        </span>
        {!board && <Skeleton bars={['40%', '70%']} />}
        {me && board && (
          <span className="race">
            <span className="disp">{g.race(me.position, board.members.length)}</span>
            <span className="muted">
              {ahead ? g.behind(ahead.points - me.points, ahead.display_name) : behind ? g.ahead(me.points - behind.points, behind.display_name) : g.leading}
            </span>
          </span>
        )}
        {lines.length > 0 && (
          <span className="news">
            <span className="eyebrow">{g.sinceVisit}</span>
            {lines.map((line) => (
              <span key={line} className="news-line">
                {line}
              </span>
            ))}
          </span>
        )}
      </button>
    </div>
  );
}

// Home's Groups panel: a page per Group, swiped sideways, Groups with news since the last visit
// first and then in the order the user joined them. It also fetches the news for the pages, and
// then counts today as the last visit. One Group is a plain card; no Groups, nothing.
export function GroupsPanel({ userId }: { userId: string }) {
  const { t } = useI18n();
  const groups = useGroups(userId);
  const ids = groups?.map((group) => group.id).join(',');
  const newsOf = useAllNews(userId, groups?.map((group) => group.id) ?? []);
  const [page, setPage] = useState(0);
  const pagesRef = useRef<HTMLDivElement>(null);
  const withNews = (group: Group) => passLines(newsOf[group.id] ?? null, t.groups).length > 0;
  // sort() is stable, so each half keeps the join order.
  const ordered = groups && [...groups].sort((a, b) => Number(withNews(b)) - Number(withNews(a)));
  const order = ordered?.map((group) => group.id).join(',');
  // The panel always opens on the first page, also when the news puts another Group there.
  useLayoutEffect(() => {
    pagesRef.current?.scrollTo({ left: 0 });
    setPage(0);
  }, [order]);
  useEffect(() => {
    refreshGroups(userId).catch(() => {});
  }, [userId]);
  useEffect(() => {
    if (!ids) return;
    const refresh = () =>
      Promise.all(ids.split(',').map((id) => refreshNews(userId, id))).then(
        () => markVisit(userId),
        () => {},
      );
    refresh();
    addEventListener('online', refresh);
    return () => removeEventListener('online', refresh);
  }, [userId, ids]);
  if (!ordered) return <Skeleton card bars={['40%', '70%']} />;
  if (ordered.length === 0) return null;
  const pages = ordered.map((group) => <GroupPage key={group.id} userId={userId} group={group} hasNews={withNews(group)} />);
  if (ordered.length === 1) return <section className="card gpanel">{pages}</section>;
  return (
    <section className="card gpanel" aria-roledescription="carousel" aria-label={t.tabs.groups}>
      <div className="gpages" ref={pagesRef} onScroll={(event) => setPage(Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth))}>
        {pages}
      </div>
      <div className="pager" aria-hidden="true">
        {ordered.map((group, index) => (
          <i key={group.id} className={index === page ? 'on' : undefined} />
        ))}
      </div>
    </section>
  );
}

function TrainedToday({ userId, group }: { userId: string; group: Group }) {
  const { t } = useI18n();
  const news = useNews(userId, group.id);
  if (!news || news.trained_today.length === 0) return null;
  return (
    <section className="card">
      <div className="eyebrow">{group.name}</div>
      {news.trained_today.map((member, index) => (
        <p key={index} className="member-name">
          <span className="avatar" style={{ '--c': member.avatar_color } as CSSProperties} aria-hidden="true">
            {initials(member.display_name)}
          </span>{' '}
          {t.groups.trainedToday(member.display_name)}
        </p>
      ))}
    </section>
  );
}

// Home: the Group members who already trained today, one card per Group that has any.
export function FriendsTrainedToday({ userId }: { userId: string }) {
  const groups = useGroups(userId);
  return (
    <>
      {groups?.map((group) => (
        <TrainedToday key={group.id} userId={userId} group={group} />
      ))}
    </>
  );
}
