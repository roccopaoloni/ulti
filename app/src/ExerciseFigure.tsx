import type { Muscle } from '@ulti/rules';
import { useEffect, useRef, useState } from 'react';
import { FigureSvg } from './figure/FigureSvg.tsx';
import { figureFor } from './figure/poses.ts';
import { Sheet } from './GroupsScreens.tsx';
import { useI18n } from './i18n.ts';

// The small figure (the start pose, or the moment its `thumb` names) beside an Exercise in the Picker and the Routine editor.
export function ExerciseThumb({ exerciseId, muscle }: { exerciseId: string; muscle: Muscle }) {
  const figure = figureFor(exerciseId, muscle);
  return (
    <span className="ex-thumb" aria-hidden="true">
      <FigureSvg figure={figure} t={figure.thumb ?? 0} thumb />
    </span>
  );
}

// Rests at the start pose, eases to the end pose, rests, and eases back, slowly and forever.
const PERIOD = 5200;
const ease = (x: number) => x * x * (3 - 2 * x);
const loop = (p: number) => (p < 0.12 ? 0 : p < 0.5 ? ease((p - 0.12) / 0.38) : p < 0.62 ? 1 : 1 - ease((p - 0.62) / 0.38));

// With reduced motion the figure stays at its start pose.
function Looping({ exerciseId, muscle, name }: { exerciseId: string; muscle: Muscle; name: string }) {
  const figure = figureFor(exerciseId, muscle);
  const [t, setT] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = requestAnimationFrame(function tick(now) {
      setT(loop((now % PERIOD) / PERIOD));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="ex-figure">
      <FigureSvg figure={figure} t={t} label={name} />
    </div>
  );
}

// An Exercise's name in a Session: a button that opens a sheet with the large figure, looping
// between the start and the end pose, and the muscles it works.
export function ExerciseName({ exerciseId, muscle, name }: { exerciseId: string; muscle: Muscle; name: string }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  // The figure only runs while the sheet is open.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const closed = () => setOpen(false);
    element?.addEventListener('close', closed);
    return () => element?.removeEventListener('close', closed);
  }, []);
  const figure = figureFor(exerciseId, muscle);
  return (
    <>
      <button
        type="button"
        className="ex-name-btn"
        aria-label={t.session.showExercise(name)}
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        {name}
      </button>
      <Sheet dialog={dialog} label={name}>
        <h2 className="disp sheet-title">{name}</h2>
        {open && <Looping exerciseId={exerciseId} muscle={muscle} name={name} />}
        <div className="fig-chips">
          {figure.worked.map((m) => (
            <span key={m} className="fig-chip">
              {t.session.muscles[m]}
            </span>
          ))}
          {figure.assist.map((m) => (
            <span key={m} className="fig-chip assist">
              {t.session.muscles[m]}
            </span>
          ))}
        </div>
        <button type="button" className="btn-link" onClick={() => dialog.current?.close()}>
          {t.close}
        </button>
      </Sheet>
    </>
  );
}
