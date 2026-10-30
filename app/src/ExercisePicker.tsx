import { matchesSearch, muscles, type Muscle } from '@ulti/rules';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from './i18n.ts';
import { backIcon, checkIcon } from './icons.tsx';
import { Info } from './Info.tsx';
import type { Exercise } from './training.ts';

// The full-screen picker shared by the Session's "Add exercise" and the Routine editor: a search
// box, a chip for each muscle and the Exercises that match both. One Exercise is picked with a tap;
// with `multiple`, several are ticked and added at once, in the order ticked.
export function ExercisePicker({
  open,
  catalog,
  exclude = [],
  multiple,
  onPick,
  onCreate,
  onClose,
}: {
  open: boolean;
  catalog: Exercise[];
  // Exercises already where they are going, as in the Session, so they aren't offered again.
  exclude?: string[];
  multiple: boolean;
  onPick: (exerciseIds: string[]) => void;
  // Creates a Custom Exercise and gives back its ID.
  onCreate: (name: string, muscle: Muscle) => Promise<string>;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const s = t.session;
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  // The name of a Custom Exercise waiting for its muscle.
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setMuscle(null);
      setPicked([]);
      setCreating(null);
      dialog.current?.showModal();
      // Focus starts on the dialog itself: not on the back button, and not on the search box, which would raise the keyboard.
      dialog.current?.focus();
    } else dialog.current?.close();
  }, [open]);

  const nameOf = (exercise: Exercise) => (language === 'es' ? exercise.nameEs : exercise.nameEn);
  const equipmentOf = (exercise: Exercise) => (exercise.equipment ? (s.equipment[exercise.equipment] ?? '') : s.customTag);
  // The search looks at the equipment too: "mancuernas" finds every dumbbell variant.
  const choices = catalog
    .filter(({ id }) => !exclude.includes(id))
    .filter((exercise) => muscle === null || exercise.muscle === muscle)
    .filter((exercise) => matchesSearch(`${nameOf(exercise)} ${equipmentOf(exercise)}`, query))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b), language));

  const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((other) => other !== id) : [...now, id]));
  const choose = (id: string) => (multiple ? toggle(id) : onPick([id]));

  async function create(chosen: Muscle) {
    const id = await onCreate(creating!, chosen);
    setCreating(null);
    setQuery('');
    choose(id);
  }

  return createPortal(
    <dialog ref={dialog} className="picker" tabIndex={-1} aria-label={s.chooseExercise} onClose={onClose}>
      <header className="picker-head">
        <button type="button" className="iconbtn" aria-label={t.close} onClick={onClose}>
          {backIcon}
        </button>
        <h2 className="s-title">
          {s.chooseExercise} <Info term="exercise" />
        </h2>
      </header>
      {creating === null ? (
        <>
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
          <div className="chips picker-chips">
            {[null, ...muscles].map((chip) => (
              <button key={chip ?? 'all'} type="button" className="chip" aria-pressed={muscle === chip} onClick={() => setMuscle(chip)}>
                {chip ? s.muscles[chip] : s.allMuscles}
              </button>
            ))}
          </div>
          <div className="picks picker-list">
            {choices.map((exercise) => (
              <button
                key={exercise.id}
                type="button"
                className="pick"
                aria-pressed={multiple ? picked.includes(exercise.id) : undefined}
                onClick={() => choose(exercise.id)}
              >
                <span>{nameOf(exercise)}</span>
                <small className="muted">{equipmentOf(exercise)}</small>
                {multiple && (
                  <span className="pick-order" aria-hidden="true">
                    {picked.includes(exercise.id) ? picked.indexOf(exercise.id) + 1 : ''}
                  </span>
                )}
              </button>
            ))}
            {choices.length === 0 && <p className="muted">{s.noMatches}</p>}
            {query.trim() !== '' && (
              <button type="button" className="pick" onClick={() => setCreating(query.trim())}>
                {s.createCustom(query.trim())}
              </button>
            )}
          </div>
          {multiple && (
            <button type="button" className="btn-primary" disabled={picked.length === 0} onClick={() => onPick(picked)}>
              {checkIcon} {s.addPicked(picked.length)}
            </button>
          )}
        </>
      ) : (
        <>
          <p className="lead">{s.chooseMuscle(creating)}</p>
          <div className="picks picker-list">
            {muscles.map((chip) => (
              <button key={chip} type="button" className="pick" onClick={() => create(chip)}>
                {s.muscles[chip]}
              </button>
            ))}
          </div>
          <button type="button" className="btn-link" onClick={() => setCreating(null)}>
            {t.close}
          </button>
        </>
      )}
    </dialog>,
    document.body,
  );
}
