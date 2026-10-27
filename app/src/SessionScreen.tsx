import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from './i18n.ts';
import { ExerciseBlock } from './ExerciseBlock.tsx';
import { backIcon } from './icons.tsx';
import { Info } from './Info.tsx';
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
    async start() {
      if (!inProgress) await training!.startSession();
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
    <button type="button" className="resume-bar" onClick={logging.start}>
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
export function StartSession({ logging }: { logging: ReturnType<typeof useLogging> }) {
  const { t } = useI18n();
  const s = t.session;
  const { inProgress } = logging;
  return (
    <button type="button" className="btn-start" onClick={logging.start}>
      <span className="disp">{inProgress ? s.resume : s.start}</span>
      <small>{inProgress ? s.logged(inProgress.sets.length) : s.startHint}</small>
    </button>
  );
}

// The Session in progress takes over the whole screen (design: Logging a Session): Exercises
// added one by one, each with its Sets as weight × reps. Weights are entered and kept in kg.
export function SessionScreen({ training, onLeave }: { training: Training; onLeave: () => void }) {
  const { t, language } = useI18n();
  const s = t.session;
  const [session, setSession] = useState<InProgress | null>(null);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const picker = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  useWakeLock();

  const reload = useCallback(async () => setSession(await training.sessionInProgress()), [training]);
  useEffect(() => {
    reload();
    training.exercises().then(setCatalog);
  }, [training, reload]);

  if (!session) return null;
  const sessionId = session.session.id;
  const nameOf = (exercise: Exercise) => (language === 'es' ? exercise.nameEs : exercise.nameEn);
  const name = (id: string) => {
    const exercise = catalog.find((candidate) => candidate.id === id);
    return exercise ? nameOf(exercise) : id;
  };
  const equipmentOf = (exercise: Exercise) => (exercise.equipment ? (s.equipment[exercise.equipment] ?? '') : s.customTag);
  // Search ignores case and accents, and looks at the equipment too: "mancuernas" finds every dumbbell variant.
  const plain = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const words = plain(query).split(/\s+/).filter(Boolean);
  const choices = catalog
    .filter(({ id }) => !session.exerciseIds.includes(id))
    .filter((exercise) => words.every((word) => plain(`${nameOf(exercise)} ${equipmentOf(exercise)}`).includes(word)))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b), language));

  async function add(exerciseId: string) {
    picker.current?.close();
    setQuery('');
    await training.addExercise(sessionId, exerciseId);
    setCatalog(await training.exercises());
    await reload();
  }

  async function finish() {
    await training.finishSession(sessionId);
    onLeave();
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
        <p className="legend">
          {s.legend} <Info term="set" />
        </p>
        {session.exerciseIds.length === 0 && <p className="muted">{s.empty}</p>}
        {session.exerciseIds.map((exerciseId) => (
          <ExerciseBlock
            key={exerciseId}
            name={name(exerciseId)}
            training={training}
            exerciseId={exerciseId}
            incrementKg={catalog.find(({ id }) => id === exerciseId)?.incrementKg ?? 2.5}
            sets={session.sets.filter((set) => set.exerciseId === exerciseId)}
            onLog={async (weightKg, reps) => {
              await training.logSet(sessionId, exerciseId, weightKg, reps);
              await reload();
            }}
          />
        ))}
        <button
          type="button"
          className="btn-ghost"
          onClick={async () => {
            setCatalog(await training.exercises());
            picker.current?.showModal();
          }}
        >
          {s.addExercise}
        </button>
        <button type="button" className="btn-primary" onClick={finish}>
          {s.finish}
        </button>
      </main>
      {createPortal(
        <dialog
          ref={picker}
          className="sheet"
          aria-label={s.chooseExercise}
          onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
        >
          <div className="sheet-body">
            <h2 className="disp sheet-title">
              {s.chooseExercise} <Info term="exercise" />
            </h2>
            <div className="field">
              <input
                type="search"
                autoComplete="off"
                aria-label={s.searchExercise}
                placeholder={s.searchExercise}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="picks">
              {choices.map((exercise) => (
                <button key={exercise.id} type="button" className="pick" onClick={() => add(exercise.id)}>
                  {nameOf(exercise)} <small className="muted">{equipmentOf(exercise)}</small>
                </button>
              ))}
              {query.trim() !== '' && (
                <button
                  type="button"
                  className="pick"
                  onClick={async () => add((await training.createExercise(query)).id)}
                >
                  {s.createCustom(query.trim())}
                </button>
              )}
            </div>
            <form method="dialog">
              <button className="btn-ghost">{t.close}</button>
            </form>
          </div>
        </dialog>,
        document.body,
      )}
    </>
  );
}

