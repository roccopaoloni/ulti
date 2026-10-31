import { asksRir, inCalibration, type RoutineDay, type Units } from '@ulti/rules';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet } from './GroupsScreens.tsx';
import { useI18n } from './i18n.ts';
import { navigate, routinePath } from './navigation.ts';
import { SessionSummary, weekProgress, type WeekProgress } from './Consistency.tsx';
import { ExerciseBlock } from './ExerciseBlock.tsx';
import { ExercisePicker } from './ExercisePicker.tsx';
import { backIcon } from './icons.tsx';
import { Info } from './Info.tsx';
import type { Layout } from './profile.ts';
import type { Exercise, Training } from './training.ts';

type InProgress = NonNullable<Awaited<ReturnType<Training['sessionInProgress']>>>;

// Whether a Session is in progress, and whether it has the screen. A Session left in progress,
// as when the app reloads into a new version, takes the screen back when the app opens.
export function useLogging(training: Training | null) {
  const [inProgress, setInProgress] = useState<InProgress | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    training?.sessionInProgress().then((found) => {
      setInProgress(found);
      setOpen(found !== null);
    });
  }, [training]);

  return {
    inProgress,
    open: training !== null && open,
    // Starts a Session, from a Routine Day or unplanned, or returns to the one in progress.
    async start(routineDayId?: string) {
      if (!inProgress) await training!.startSession(routineDayId);
      setOpen(true);
    },
    async leave() {
      setInProgress(await training!.sessionInProgress());
      setOpen(false);
    },
  };
}

// The "Session in progress" bar shown above the tab bar on every tab while the Session doesn't
// have the screen: one tap returns to it.
export function SessionInProgressBar({ logging }: { logging: ReturnType<typeof useLogging> }) {
  const { t } = useI18n();
  if (!logging.inProgress || logging.open) return null;
  return (
    <button type="button" className="resume-bar" onClick={() => logging.start()}>
      <span>
        <strong>{t.session.bar}</strong>
        <small>{t.session.logged(logging.inProgress.sets.length)}</small>
      </span>
      <span className="disp">{t.session.resume}</span>
    </button>
  );
}

// Keeps the screen awake while a Session is on it, where the browser supports it. The browser
// releases the lock when the page is hidden, so it asks again when the page is back.
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    let done = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        ?.request('screen')
        .then((sentinel) => {
          if (done) sentinel.release();
          else lock = sentinel;
        })
        .catch(() => {});
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => {});
    };
  }, []);
}

// The button on Home that starts a Session, or returns to the one in progress.
// The Routine's next Session is suggested, with a way to log an unplanned one instead.
export function StartSession({ logging, training }: { logging: ReturnType<typeof useLogging>; training: Training }) {
  const { t } = useI18n();
  const s = t.session;
  const { inProgress } = logging;
  const [next, setNext] = useState<RoutineDay | null>(null);
  const [deload, setDeload] = useState<Awaited<ReturnType<Training['deload']>> | null>(null);
  useEffect(() => {
    training.nextRoutineDay().then(setNext);
    training.deload().then(setDeload);
  }, [training, inProgress]);
  const d = t.deload;
  const noRoutine = useRef<HTMLDialogElement>(null);
  // With no Routine, Start asks first, unless the lifter said they don't follow one. Read when
  // tapped, so a choice that just arrived from the server counts.
  const start = async () => {
    if (inProgress || next || (await training.followsNoRoutine()) || (await training.nextRoutineDay())) logging.start(next?.id);
    else noRoutine.current?.showModal();
  };
  const answer = async (accept: boolean) => {
    await training.answerDeload(accept);
    setDeload(await training.deload());
  };
  return (
    <>
      {deload?.active && (
        <p className="go-heavier">
          <span className="badge">{d.active}</span> <Info term="deload" />
        </p>
      )}
      {deload?.suggestion && (
        <section className="card">
          <p>
            {d[deload.suggestion]} <Info term="deload" />
          </p>
          <p className="go-heavier">
            <button type="button" className="btn-ghost" onClick={() => answer(true)}>
              {d.accept}
            </button>
            <button type="button" className="btn-link inline" onClick={() => answer(false)}>
              {d.dismiss}
            </button>
          </p>
        </section>
      )}
      <Sheet dialog={noRoutine} label={s.noRoutineTitle}>
        <h2 className="disp sheet-title">{s.noRoutineTitle}</h2>
        <p className="muted">{s.noRoutineText}</p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            noRoutine.current?.close();
            navigate(routinePath);
          }}
        >
          {s.noRoutineSetUp}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            noRoutine.current?.close();
            logging.start();
          }}
        >
          {s.noRoutineLog}
        </button>
        <button
          type="button"
          className="btn-link"
          onClick={async () => {
            await training.setFollowsNoRoutine(true);
            noRoutine.current?.close();
            logging.start();
          }}
        >
          {s.noRoutineNever}
        </button>
      </Sheet>
      <button type="button" className="btn-start" onClick={start}>
        <span className="disp">{inProgress ? s.resume : s.start}</span>
        <small>{inProgress ? s.logged(inProgress.sets.length) : next ? s.startNext(next.name) : s.startHint}</small>
      </button>
      {next && !inProgress && (
        <button type="button" className="btn-link" onClick={() => logging.start()}>
          {s.startUnplanned}
        </button>
      )}
      {deload?.canStart && !deload.suggestion && (
        <button
          type="button"
          className="btn-link"
          onClick={async () => {
            await training.startDeload();
            setDeload(await training.deload());
          }}
        >
          {d.start}
        </button>
      )}
    </>
  );
}

// The Session in progress takes over the whole screen (design: Logging a Session): Exercises
// added one by one, each with its Sets as weight × reps. Weights are entered and shown in the user's units and kept in kg.
export function SessionScreen({ training, units, layout, onLeave }: { training: Training; units: Units; layout: Layout; onLeave: () => void }) {
  const { t, language } = useI18n();
  const s = t.session;
  const [session, setSession] = useState<InProgress | null>(null);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [picking, setPicking] = useState(false);
  const [scoring, setScoring] = useState<Awaited<ReturnType<Training['scoring']>> | null>(null);
  // The "PR!" banner: it floats over the Session and never takes a tap, so logging goes on under it.
  const [banner, setBanner] = useState<{ key: string; text: string } | null>(null);
  const [summary, setSummary] = useState<{ progress: WeekProgress; earned: number } | null>(null);
  // The Focus layout shows one Exercise at a time: the one picked, or else the first.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [deload, setDeload] = useState(false);
  useWakeLock();
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(timer);
  }, [banner]);

  const reload = useCallback(async () => {
    setSession(await training.sessionInProgress());
    setScoring(await training.scoring());
    setDeload((await training.deload()).active);
  }, [training]);
  useEffect(() => {
    reload();
    training.exercises().then(setCatalog);
  }, [training, reload]);

  if (summary) return <SessionSummary {...summary} onClose={onLeave} />;
  if (!session) return null;
  const sessionId = session.session.id;
  const focused = session.exerciseIds.includes(focusedId ?? '') ? focusedId : session.exerciseIds[0];
  const nameOf = (exercise: Exercise) => (language === 'es' ? exercise.nameEs : exercise.nameEn);
  const name = (id: string) => {
    const exercise = catalog.find((candidate) => candidate.id === id);
    return exercise ? nameOf(exercise) : id;
  };
  async function add(exerciseId: string) {
    setPicking(false);
    await training.addExercise(sessionId, exerciseId);
    setFocusedId(exerciseId);
    setCatalog(await training.exercises());
    await reload();
  }

  async function finish() {
    const profile = await training.profile();
    const progressOf = async (without?: string) => weekProgress((await training.scoring(without)).consistency, profile);
    const before = await progressOf(sessionId);
    await training.finishSession(sessionId);
    const progress = await progressOf();
    setSummary({ progress, earned: progress.points - before.points });
  }

  return (
    <>
      <header className="s-head">
        <button type="button" className="iconbtn" aria-label={s.leave} onClick={onLeave}>
          {backIcon}
        </button>
        <div>
          <h1 className="s-title">
            {s.title} <Info term="session" />
          </h1>
          <div className="s-sub">{s.sets(session.sets.length)}</div>
        </div>
        <button type="button" className="btn-ghost s-finish" onClick={finish}>
          {s.finish}
        </button>
      </header>
      <main className="screen session">
        {banner && (
          <div key={banner.key} className="pr-banner" role="status">
            {banner.text}
          </div>
        )}
        <p className="legend">
          {s.legend} <Info term="set" />
        </p>
        {session.exerciseIds.length === 0 && <p className="muted">{s.empty}</p>}
        {layout === 'focus' && session.exerciseIds.length > 1 && (
          <div className="f-prog" role="group" aria-label={s.focusExercises}>
            {session.exerciseIds.map((exerciseId) => (
              <button
                key={exerciseId}
                type="button"
                aria-label={name(exerciseId)}
                aria-current={exerciseId === focused}
                className={exerciseId === focused ? 'on' : ''}
                onClick={() => setFocusedId(exerciseId)}
              />
            ))}
          </div>
        )}
        {session.exerciseIds.filter((exerciseId) => layout === 'list' || exerciseId === focused).map((exerciseId) => (
          <ExerciseBlock
            key={exerciseId}
            focus={layout === 'focus'}
            deload={deload}
            name={name(exerciseId)}
            training={training}
            exerciseId={exerciseId}
            incrementKg={catalog.find(({ id }) => id === exerciseId)?.incrementKg ?? 2.5}
            bodyweight={catalog.find(({ id }) => id === exerciseId)?.bodyweight ?? false}
            dumbbell={catalog.find(({ id }) => id === exerciseId)?.equipment === 'dumbbell'}
            units={units}
            target={session.plan.find((planned) => planned.exerciseId === exerciseId)}
            sets={session.sets.filter((set) => set.exerciseId === exerciseId)}
            records={new Map(scoring?.events.map((event) => [event.setId, event]))}
            calibrating={scoring ? inCalibration(scoring.history, exerciseId) : false}
            custom={catalog.find(({ id }) => id === exerciseId)?.custom !== false}
            asksRir={(setId) => asksRir(session.sets.map((set) => ({ ...set, exercise: set.exerciseId })), setId)}
            onLog={async (weightKg, reps, label) => {
              const set = await training.logSet(sessionId, exerciseId, weightKg, reps, label);
              const record = (await training.scoring()).events.find((event) => event.setId === set.id);
              if (record) {
                setBanner({ key: set.id, text: s.record(name(exerciseId), record.percentGain, record.progressPoints) });
              }
              await reload();
              return set.id;
            }}
            onRir={async (setId, rir) => {
              await training.setRir(setId, rir);
              await reload();
            }}
            onUnlog={async (setId) => {
              setBanner(null);
              await training.deleteSet(setId);
              await reload();
            }}
            onIncrement={async (incrementKg) => {
              await training.setIncrement(exerciseId, incrementKg);
              setCatalog(await training.exercises());
            }}
            onSetLabel={async (setId, label) => {
              await training.setLabel(setId, label);
              await reload();
            }}
          />
        ))}
        <button
          type="button"
          className="btn-ghost"
          onClick={async () => {
            setCatalog(await training.exercises());
            setPicking(true);
          }}
        >
          {s.addExercise}
        </button>
        <button type="button" className="btn-primary" onClick={finish}>
          {s.finish}
        </button>
      </main>
      <ExercisePicker
        open={picking}
        catalog={catalog}
        exclude={session.exerciseIds}
        multiple={false}
        onPick={([exerciseId]) => add(exerciseId)}
        onCreate={async (exerciseName, muscle) => (await training.createExercise(exerciseName, muscle)).id}
        onClose={() => setPicking(false)}
      />
    </>
  );
}

