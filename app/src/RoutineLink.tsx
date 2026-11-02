import { unpackRoutineLink } from '@ulti/rules';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { dayColourVar } from './dayColour.ts';
import { Sheet } from './GroupsScreens.tsx';
import { useI18n } from './i18n.ts';
import { navigate, paths, routinePath } from './navigation.ts';
import { Skeleton } from './Skeleton.tsx';
import { SubScreen } from './SubScreen.tsx';
import type { Exercise, Training } from './training.ts';

// Opening a Routine Link while signed in: a read-only preview of the Routine it carries, and a
// button that loads it as the lifter's own. The copy remembers nothing about who sent it.
export function RoutineLinkScreen({ training }: { training: Training }) {
  const { t, language } = useI18n();
  const r = t.routineLink;
  const [catalog, setCatalog] = useState<Exercise[] | null>(null);
  const [busy, setBusy] = useState(false);
  const replaceDialog = useRef<HTMLDialogElement>(null);
  // A phone new to this user has no catalog until the first download, and reading the link
  // without it would drop every Exercise, so wait for it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const read = () =>
      training.exercises().then((exercises) => {
        setCatalog(exercises);
        if (exercises.length === 0) timer = setTimeout(read, 500);
      });
    read();
    return () => clearTimeout(timer);
  }, [training]);

  if (!catalog?.length) return <Skeleton card bars={['30%', '100%', '60%']} />;
  const link = unpackRoutineLink(location.hash.slice(1), new Set(catalog.filter((exercise) => !exercise.custom).map(({ id }) => id)));
  if (!link) {
    return (
      <SubScreen title={r.title} parent={paths.train}>
        <section className="card">
          <h2 className="disp">{r.brokenTitle}</h2>
          <p className="muted">{r.brokenText}</p>
        </section>
        <button type="button" className="btn-ghost" onClick={() => navigate(paths.train, true)}>
          {t.close}
        </button>
      </SubScreen>
    );
  }

  const nameOf = (id: string) => {
    const exercise = catalog.find((candidate) => candidate.id === id);
    return exercise ? (language === 'es' ? exercise.nameEs : exercise.nameEn) : id;
  };
  const load = async () => {
    setBusy(true);
    replaceDialog.current?.close();
    // The same save as editing by hand: it syncs, and clears "I don't follow a routine".
    await training.saveRoutineDraft(link.days.map((day) => ({ ...day, id: crypto.randomUUID() })));
    navigate(routinePath, true);
  };

  return (
    <SubScreen title={r.title} parent={paths.train}>
      <p className="lead">{r.heading(link.sender)}</p>
      {link.dropped > 0 && <p className="muted">{r.dropped(link.dropped)}</p>}
      <div className="routine">
        {link.days.map((day, index) => (
          <div key={index} className="card routine-day" style={{ '--c': dayColourVar(day.colour ?? 0) } as CSSProperties}>
            <div className="routine-day-head">
              <div className="routine-day-title">
                <div className="eyebrow">{t.routine.day(index + 1)}</div>
                <p className="disp">{day.name}</p>
              </div>
            </div>
            <div className="routine-day-body">
              <div className="routine-rows">
                {day.exercises.map((e, i) => (
                  <div key={i} className="rex">
                    <div className="rex-row">
                      <div className="rex-main">
                        <span className="rex-name">{nameOf(e.exerciseId)}</span>
                        <span className="rex-sets">
                          {e.sets} × {e.repMin}–{e.repMax}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn-primary"
        disabled={busy}
        onClick={async () => ((await training.routine()) ? replaceDialog.current?.showModal() : load())}
      >
        {r.use}
      </button>
      <Sheet dialog={replaceDialog} label={r.replaceTitle}>
        <h2 className="disp sheet-title">{r.replaceTitle}</h2>
        <p>{r.replaceText}</p>
        <button type="button" className="btn-danger" onClick={load}>
          {r.replaceConfirm}
        </button>
        <form method="dialog">
          <button className="btn-ghost">{t.routine.cancel}</button>
        </form>
      </Sheet>
    </SubScreen>
  );
}
