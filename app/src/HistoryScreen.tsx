import {
  dayColour,
  historyWeeks,
  incrementInUnits,
  kgToUnits,
  labelSets,
  sessionConsistencyPoints,
  unitsToKg,
  type ConsistencyWeek,
  type Dated,
  type PersonalRecord,
  type RoutineDay,
  type SetLabel,
  type Units,
} from '@ulti/rules';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { dayColourVar } from './dayColour.ts';
import { Keypad } from './ExerciseBlock.tsx';
import { Sheet } from './GroupsScreens.tsx';
import { useI18n } from './i18n.ts';
import { chevronIcon, checkIcon } from './icons.tsx';
import { historyPath, navigate, paths, sessionPath } from './navigation.ts';
import { today } from './profile.ts';
import { Skeleton } from './Skeleton.tsx';
import { SubScreen } from './SubScreen.tsx';
import type { Exercise, SetRecord, Training } from './training.ts';

type Past = Awaited<ReturnType<Training['pastSessions']>>[number];

// Everything the Train tab's recent Sessions, the History screen and a Session's detail screen show,
// read from this phone, so it works offline. `reload` re-reads it after a Set is fixed or deleted.
function useHistory(training: Training) {
  const [sessions, setSessions] = useState<Past[] | null>(null);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [days, setDays] = useState<RoutineDay[]>([]);
  // The Personal Records among all the Sets, by Set ID.
  const [records, setRecords] = useState(new Map<string, PersonalRecord>());
  // The Consistency Points each Session added, by the ID of any of its Sets.
  const [sessionPoints, setSessionPoints] = useState(new Map<string, number>());
  const [consistency, setConsistency] = useState<ConsistencyWeek[]>([]);
  const [weeklyTargets, setWeeklyTargets] = useState<Dated<number>[]>([]);

  const reload = useCallback(async () => {
    const scoring = await training.scoring();
    setRecords(new Map(scoring.events.map((event) => [event.setId, event])));
    const added = sessionConsistencyPoints(scoring.history);
    setSessionPoints(new Map(scoring.history.sessions.flatMap((session, i) => session.sets.map((set) => [set.id, added[i]!] as const))));
    setConsistency(scoring.consistency);
    setWeeklyTargets(scoring.history.weeklyTargets);
    setSessions(await training.pastSessions());
  }, [training]);
  useEffect(() => {
    reload();
    training.exercises().then(setCatalog);
    training.routine().then((routine) => setDays(routine?.days ?? []));
  }, [training, reload]);

  return { sessions, catalog, days, records, sessionPoints, consistency, weeklyTargets, reload };
}
type HistoryData = ReturnType<typeof useHistory>;

function useNames(catalog: Exercise[]) {
  const { language } = useI18n();
  return (id: string) => {
    const exercise = catalog.find((candidate) => candidate.id === id);
    return exercise ? (language === 'es' ? exercise.nameEs : exercise.nameEn) : id;
  };
}

// A Personal Record's gain, whole percent unless it is under 1.
const percent = (gain: number) => (gain >= 1 ? Math.round(gain) : Math.round(gain * 10) / 10);

const formatDay = (language: string, localDate: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(new Date(localDate));

// A Session's Routine Day: its name and colour, or none when it didn't come from the Routine or the
// Day was since removed.
function dayOf(past: Past, days: RoutineDay[]) {
  const index = days.findIndex((day) => day.id === past.session.routineDayId);
  return index < 0 ? null : { name: days[index].name, colour: dayColourVar(dayColour(days, index)) };
}

// A Session's label for each of its Sets, worked out per Exercise as the logging screen does.
function labelsOf(sets: SetRecord[]) {
  return new Map(
    [...new Set(sets.map((set) => set.exerciseId))].flatMap((exerciseId) => {
      const exerciseSets = sets.filter((set) => set.exerciseId === exerciseId);
      const labels = labelSets(exerciseSets);
      return exerciseSets.map((set, index) => [set.id, labels[index]] as const);
    }),
  );
}

// One past Session as a compact tappable row: its Routine Day's dot, weekday and date, the Day's
// name and the number of Exercises, and a chip for a Personal Record (more of them collapse to "+n").
function SessionRow({ past, data }: { past: Past; data: HistoryData }) {
  const { t, language } = useI18n();
  const h = t.history;
  const name = useNames(data.catalog);
  const day = dayOf(past, data.days);
  const exercises = new Set(past.sets.map((set) => set.exerciseId)).size;
  const chips = past.sets.flatMap((set) => {
    const record = data.records.get(set.id);
    return record ? [h.recordChip(name(set.exerciseId), percent(record.percentGain))] : [];
  });
  return (
    <button type="button" className={`sess${day ? ' has-day' : ''}`} style={{ '--c': day?.colour } as CSSProperties} onClick={() => navigate(sessionPath(past.session.id))}>
      <span className={`sess-dot${day ? '' : ' none'}`} />
      <span className="sess-main">
        <strong>{formatDay(language, past.session.localDate, { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
        <small>{[day?.name ?? h.noRoutine, h.exercises(exercises)].join(' · ')}</small>
      </span>
      {chips.length > 0 && (
        <span className="sess-prs">
          <span className="pr">{chips[0]}</span>
          {chips.length > 1 && <span className="pr more">+{chips.length - 1}</span>}
        </span>
      )}
      {chevronIcon}
    </button>
  );
}

// The Train tab: the last 3 Sessions and the way to all of them.
export function RecentSessions({ training }: { training: Training }) {
  const { t } = useI18n();
  const h = t.history;
  const data = useHistory(training);
  if (!data.sessions) return <Skeleton card bars={['30%', '100%', '100%']} />;
  if (data.sessions.length === 0) return <p className="muted">{h.empty}</p>;
  return (
    <section className="history">
      <div className="row-head">
        <h2 className="eyebrow">{h.recent}</h2>
        <button type="button" className="see-all" onClick={() => navigate(historyPath)}>
          {h.seeAll}
          {chevronIcon}
        </button>
      </div>
      <div className="card list">
        {data.sessions.slice(0, 3).map((past) => (
          <SessionRow key={past.session.id} past={past} data={data} />
        ))}
      </div>
    </section>
  );
}

// How many weeks the History screen loads at a time.
const PAGE = 8;

// All past Sessions grouped by week, newest first, the current week included; older weeks load
// 8 at a time as the list is scrolled to its end.
export function HistoryScreen({ training }: { training: Training }) {
  const { t, language } = useI18n();
  const h = t.history;
  const data = useHistory(training);
  const [shown, setShown] = useState(PAGE);
  const more = useRef<HTMLButtonElement>(null);
  const { sessions } = data;
  const weeks = sessions
    ? historyWeeks({
        sessions: sessions.map((past) => ({ localDate: past.session.localDate, past })),
        consistency: data.consistency,
        records: [...data.records.values()],
        weeklyTargets: data.weeklyTargets,
        today: today(),
      })
    : [];
  const hasMore = weeks.length > shown;

  useEffect(() => {
    const button = more.current;
    if (!button || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setShown((count) => count + PAGE);
    });
    observer.observe(button);
    return () => observer.disconnect();
  }, [hasMore, shown]);

  const range = (week: string, end: string) =>
    `${formatDay(language, week, { day: 'numeric', month: 'short' })} – ${formatDay(language, end, { day: 'numeric', month: 'short' })}`;
  const thisWeek = weeks[0]?.week;

  return (
    <SubScreen title={h.title} parent={paths.train}>
      {!sessions ? (
        <Skeleton card bars={['30%', '100%', '100%', '100%']} />
      ) : sessions.length === 0 ? (
        <p className="muted">{h.empty}</p>
      ) : (
        weeks.slice(0, shown).map((week) =>
          week.sessions.length === 0 && week.week !== thisWeek ? (
            <p key={week.week} className="empty-week">
              <b>{range(week.week, week.end)}</b> · {h.noSessions}
            </p>
          ) : (
            <section key={week.week} className="week">
              <div className="week-head">
                <span className={`wk-stamp${week.stamped ? '' : ' no'}`}>{checkIcon}</span>
                <span className="when">
                  <b>{week.week === thisWeek ? t.consistency.thisWeek : range(week.week, week.end)}</b>
                  <small>
                    {week.week === thisWeek
                      ? range(week.week, week.end)
                      : week.stamped
                        ? h.weekStamp
                        : h.weekProgress(week.done, week.target)}
                  </small>
                </span>
                {week.target > 0 && (
                  <span className="tally" role="img" aria-label={h.weekProgress(week.done, week.target)}>
                    {Array.from({ length: week.target }, (_, i) => (
                      <i key={i} className={i < week.done ? 'f' : undefined} />
                    ))}
                  </span>
                )}
                <span className="wk-pts">{h.points(Math.round(week.points))}</span>
              </div>
              {week.sessions.length === 0 ? (
                <p className="empty-week">{h.noSessions}</p>
              ) : (
                <div className="card list">
                  {week.sessions.map(({ past }) => (
                    <SessionRow key={past.session.id} past={past} data={data} />
                  ))}
                </div>
              )}
            </section>
          ),
        )
      )}
      {hasMore && (
        <button type="button" ref={more} className="btn-ghost" onClick={() => setShown((count) => count + PAGE)}>
          {h.showEarlier}
        </button>
      )}
    </SubScreen>
  );
}

// One past Session: its Exercises and Sets, with each Set's label and Personal Record. Tapping a
// Set opens a sheet to fix or delete it, offline too.
export function SessionDetailScreen({ training, units, sessionId }: { training: Training; units: Units; sessionId: string }) {
  const { t, language } = useI18n();
  const h = t.history;
  const data = useHistory(training);
  const name = useNames(data.catalog);
  const past = data.sessions?.find(({ session }) => session.id === sessionId);

  // Deleting the last Set takes the Session out of History: nothing left to show here.
  useEffect(() => {
    if (data.sessions && !past) navigate(historyPath, true);
  }, [data.sessions, past]);
  if (!past) return null;

  const { session, sets } = past;
  const day = dayOf(past, data.days);
  const labels = labelsOf(sets);
  const progress =
    sets.reduce((sum, set) => sum + (data.records.get(set.id)?.progressPoints ?? 0), 0) + (data.sessionPoints.get(sets[0]!.id) ?? 0);
  const exerciseIds = [...new Set(sets.map((set) => set.exerciseId))];

  return (
    <SubScreen title={formatDay(language, session.localDate, { weekday: 'short', day: 'numeric', month: 'short' })} parent={historyPath} colour={day?.colour}>
      <div className="summary" style={{ '--c': day?.colour } as CSSProperties}>
        <div className="stat day-name">
          <b>{day?.name ?? h.noRoutine}</b>
          <small>{h.routineLabel}</small>
        </div>
        <div className="stat">
          <b>{sets.length}</b>
          <small>{h.setsLabel}</small>
        </div>
        <div className="stat">
          <b>+{Math.round(progress)}</b>
          <small>{h.progressLabel}</small>
        </div>
      </div>
      {exerciseIds.map((exerciseId) => {
        const exerciseSets = sets.filter((set) => set.exerciseId === exerciseId);
        let working = 0;
        return (
          <section key={exerciseId} className={`card${day ? ' day-card' : ''}`} style={{ '--c': day?.colour } as CSSProperties}>
            <div className="ex-name">{name(exerciseId)}</div>
            <div>
              {exerciseSets.map((set) => {
                const label = labels.get(set.id)!;
                if (label !== 'warm-up') working++;
                return (
                  <PastSet
                    key={set.id}
                    set={set}
                    label={label}
                    number={working}
                    exerciseName={name(exerciseId)}
                    units={units}
                    incrementKg={data.catalog.find(({ id }) => id === exerciseId)?.incrementKg ?? 2.5}
                    bodyweight={data.catalog.find(({ id }) => id === exerciseId)?.bodyweight ?? false}
                    record={data.records.get(set.id)}
                    onEdit={async (weightKg, reps) => {
                      await training.editSet(set.id, weightKg, reps);
                      await data.reload();
                    }}
                    onDelete={async () => {
                      await training.deleteSet(set.id);
                      await data.reload();
                    }}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="history-hint">{h.tapHint}</p>
    </SubScreen>
  );
}

function PastSet({
  set,
  label,
  number,
  exerciseName,
  units,
  incrementKg,
  bodyweight,
  record,
  onEdit,
  onDelete,
}: {
  set: SetRecord;
  label: SetLabel;
  number: number;
  exerciseName: string;
  units: Units;
  incrementKg: number;
  bodyweight: boolean;
  record: PersonalRecord | undefined;
  onEdit: (weightKg: number, reps: number) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t, language, formatNumber } = useI18n();
  const h = t.history;
  // The sheet shows the form to fix the Set, or asks to confirm its deletion.
  const [confirming, setConfirming] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const typed = String(Math.round(kgToUnits(set.weightKg, units) * 100) / 100).replace('.', language === 'es' ? ',' : '.');
  const [weight, setWeight] = useState(typed);
  const [reps, setReps] = useState(String(set.reps));
  // The logging screen's own keypad types the weight or the reps.
  const [editing, setEditing] = useState<'weight' | 'reps' | null>(null);

  const typedWeight = Number(weight.replace(',', '.'));
  const weightKg = unitsToKg(typedWeight, units);
  const valid = weight.trim() !== '' && Number.isFinite(typedWeight) && typedWeight >= 0 && /^[1-9]\d*$/.test(reps);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    dialog.current?.close();
    await onEdit(weightKg, Number(reps));
  }

  const load = bodyweight
    ? t.session.bodyweightLoad(set.weightKg ? `${formatNumber(kgToUnits(set.weightKg, units), 2)} ${units}` : '')
    : `${formatNumber(kgToUnits(set.weightKg, units), 2)} ${units}`;

  return (
    <>
      <button
        type="button"
        className={`hset${record ? ' is-pr' : ''}`}
        onClick={() => {
          setConfirming(false);
          setWeight(typed);
          setReps(String(set.reps));
          dialog.current?.showModal();
        }}
      >
        <span className={`n label-${label}`}>{label === 'warm-up' ? h.warmUpShort : number}</span>
        <span className="v">
          {load} × {set.reps}
          {set.rir !== undefined && <small> · RIR {set.rir}</small>}
        </span>
        {record ? <span className="pr-tag">{`PR +${percent(record.percentGain)}% · ${t.session.points(Math.round(record.progressPoints))}`}</span> : <span />}
      </button>
      <Sheet dialog={dialog} label={confirming ? h.deleteTitle : h.setTitle}>
        {confirming ? (
          <>
            <h2 className="disp sheet-title">{h.deleteTitle}</h2>
            <p>
              <strong>{exerciseName}</strong>: {load} × {set.reps}
            </p>
            <p>{h.deleteText}</p>
            <button
              type="button"
              className="btn-danger"
              onClick={async () => {
                dialog.current?.close();
                await onDelete();
              }}
            >
              {h.deleteConfirm}
            </button>
            <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()}>
              {h.cancel}
            </button>
          </>
        ) : (
          <form className="set-edit" onSubmit={save}>
            <h2 className="disp sheet-title">{h.setTitle}</h2>
            <p className="muted">
              <strong>{exerciseName}</strong> · {label === 'warm-up' ? t.session.warmUp : t.session.working}
            </p>
            <div className="past-set">
              <button type="button" aria-label={bodyweight ? t.session.addedWeight : t.session.weight} onClick={() => setEditing('weight')}>
                {weight || '–'}
              </button>
              <span>×</span>
              <button type="button" aria-label={t.session.reps} onClick={() => setEditing('reps')}>
                {reps || '–'}
              </button>
            </div>
            <button className="btn-primary" disabled={!valid}>
              {h.save}
            </button>
            <button type="button" className="btn-ghost danger" onClick={() => setConfirming(true)}>
              {h.delete}
            </button>
            <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()}>
              {h.cancel}
            </button>
          </form>
        )}
      </Sheet>
      {editing && (
        <Keypad
          label={editing === 'weight' ? (bodyweight ? t.session.addedWeight : t.session.weight) : t.session.reps}
          value={editing === 'weight' ? weight : reps}
          decimal={editing === 'weight' ? (language === 'es' ? ',' : '.') : null}
          step={editing === 'weight' ? incrementInUnits(incrementKg, units) : 1}
          onChange={editing === 'weight' ? setWeight : setReps}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
