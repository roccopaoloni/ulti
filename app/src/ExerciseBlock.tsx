import { incrementInUnits, kgToUnits, labelSets, plannedRows, stepValue, unitsToKg, type PersonalRecord, type RoutineExercise, type SetLabel, type Units } from '@ulti/rules';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from './i18n.ts';
import { checkIcon } from './icons.tsx';
import { Info } from './Info.tsx';
import type { SetRecord, Training } from './training.ts';

type Planned = { weightKg: number; reps: number };

// One Exercise of the Session: its Sets so far, then the rows still to do, pre-filled with the
// last Session's numbers for this Exercise (design: Logging a Session, List layout).
export function ExerciseBlock({
  name,
  training,
  exerciseId,
  incrementKg,
  bodyweight,
  units,
  target,
  sets,
  records,
  calibrating,
  onLog,
  onSetLabel,
}: {
  name: string;
  training: Training;
  exerciseId: string;
  incrementKg: number;
  // A bodyweight Exercise: its weight is the weight added to the lifter's own, shown as "BW +10 kg".
  bodyweight: boolean;
  units: Units;
  // What the Routine plans for this Exercise, when the Session came from one.
  target?: RoutineExercise;
  sets: SetRecord[];
  // The Personal Records among the Sets, by Set ID, and whether the Exercise is still in Calibration.
  records: Map<string, PersonalRecord>;
  calibrating: boolean;
  onLog: (weightKg: number, reps: number) => Promise<void>;
  onSetLabel: (setId: string, label: SetLabel) => Promise<void>;
}) {
  const { t, formatNumber } = useI18n();
  const labels = labelSets(sets);
  const [last, setLast] = useState<Planned[] | null>(null);
  useEffect(() => {
    training.lastSets(exerciseId).then(setLast);
  }, [training, exerciseId]);

  // Past the plan, the next Set repeats the last one logged.
  const plan = last && plannedRows(last, target?.sets);
  const next = plan ? (plan[sets.length] ?? sets.at(-1)) : undefined;
  const weightCell = (weightKg: number) =>
    bodyweight ? (
      <span className="cell">
        {t.session.bodyweightLoad(weightKg ? `${formatNumber(kgToUnits(weightKg, units), 2)} ${units}` : '')}
      </span>
    ) : (
      <span className="cell">
        {formatNumber(kgToUnits(weightKg, units), 2)}
        <small>{units}</small>
      </span>
    );
  return (
    <section className="ex">
      <h2 className="ex-name">{name}</h2>
      {calibrating && (
        <p className="calibration">
          {t.session.calibration} <Info term="calibration" />
        </p>
      )}
      {target && <p className="muted">{t.session.target(target.sets, target.repMin, target.repMax)}</p>}
      {sets.map((set, index) => (
        <div key={set.id} className="set done">
          <button
            type="button"
            className={`tag label-${labels[index]}`}
            aria-label={t.session.flipLabel(labels[index] === 'warm-up' ? t.session.warmUp : t.session.working)}
            onClick={() => onSetLabel(set.id, labels[index] === 'warm-up' ? 'working' : 'warm-up')}
          >
            {index + 1}
            <small>{labels[index] === 'warm-up' ? t.session.warmUp : t.session.working}</small>
          </button>
          {weightCell(set.weightKg)}
          <span className="xmark">×</span>
          <span className="cell">{set.reps}</span>
          <span className="check" aria-hidden="true">
            {records.has(set.id) ? <small className="pr-points">{t.session.points(records.get(set.id)!.progressPoints)}</small> : checkIcon}
          </span>
        </div>
      ))}
      {plan && (
        <NextSet key={sets.length} number={sets.length + 1} planned={next} incrementKg={incrementKg} bodyweight={bodyweight} units={units} onLog={onLog} />
      )}
      {plan?.slice(sets.length + 1).map((set, index) => (
        <div key={index} className="set upcoming" aria-hidden="true">
          <span className="tag">{sets.length + index + 2}</span>
          {set ? (
            weightCell(set.weightKg)
          ) : (
            <span className="cell">
              –<small>{units}</small>
            </span>
          )}
          <span className="xmark">×</span>
          <span className="cell">{set?.reps ?? '–'}</span>
          <span />
        </div>
      ))}
    </section>
  );
}

// The next Set to do. ✓ logs it exactly as shown; tapping a number opens the keypad to change it.
function NextSet({
  number,
  planned,
  incrementKg,
  bodyweight,
  units,
  onLog,
}: {
  number: number;
  planned: Planned | undefined;
  incrementKg: number;
  bodyweight: boolean;
  units: Units;
  onLog: (weightKg: number, reps: number) => Promise<void>;
}) {
  const { t, language } = useI18n();
  const s = t.session;
  // The keypad's decimal key matches the language (design: Numbers).
  const decimal = language === 'es' ? ',' : '.';
  const [weight, setWeight] = useState(planned ? String(Math.round(kgToUnits(planned.weightKg, units) * 100) / 100).replace('.', decimal) : bodyweight ? '0' : '');
  const [reps, setReps] = useState(planned ? String(planned.reps) : '');
  const [editing, setEditing] = useState<'weight' | 'reps' | null>(null);
  const [busy, setBusy] = useState(false);

  const typedWeight = Number(weight.replace(',', '.'));
  const weightKg = unitsToKg(typedWeight, units);
  const valid = weight.trim() !== '' && Number.isFinite(typedWeight) && typedWeight >= 0 && /^[1-9]\d*$/.test(reps);

  async function log() {
    if (!valid || busy) return;
    setBusy(true);
    await onLog(weightKg, Number(reps));
    setBusy(false);
  }

  return (
    <div className="set">
      <span className="tag">{number}</span>
      <button type="button" className="cell" aria-label={bodyweight ? s.addedWeight : s.weight} onClick={() => setEditing('weight')}>
        {bodyweight && 'BW +'}
        {weight || '–'}
        <small>{units}</small>
      </button>
      <span className="xmark">×</span>
      <button type="button" className="cell" aria-label={s.reps} onClick={() => setEditing('reps')}>
        {reps || '–'}
      </button>
      <button type="button" className="check" aria-label={s.logSet} disabled={!valid || busy} onClick={log}>
        {checkIcon}
      </button>
      {editing && (
        <Keypad
          label={editing === 'weight' ? (bodyweight ? s.addedWeight : s.weight) : s.reps}
          value={editing === 'weight' ? weight : reps}
          decimal={editing === 'weight' ? decimal : null}
          step={editing === 'weight' ? incrementInUnits(incrementKg, units) : 1}
          onChange={editing === 'weight' ? setWeight : setReps}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// A large keypad in a sheet, for one number. The first key typed replaces the number; ± step it.
// `decimal` is the language's decimal key, or null for a whole number.
function Keypad({
  label,
  value,
  decimal,
  step,
  onChange,
  onClose,
}: {
  label: string;
  value: string;
  decimal: string | null;
  step: number;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const s = t.session;
  const dialog = useRef<HTMLDialogElement>(null);
  const [fresh, setFresh] = useState(true);
  useEffect(() => dialog.current?.showModal(), []);

  const type = (key: string) => {
    const base = fresh ? '' : value;
    if (key === decimal) onChange(base === '' ? `0${key}` : base.includes(key) ? base : base + key);
    else onChange(base === '0' ? key : base + key);
    setFresh(false);
  };
  const stepBy = (direction: 1 | -1) => {
    const current = Number(value.replace(',', '.')) || 0;
    onChange(String(stepValue(current, step, direction)).replace('.', decimal ?? '.'));
    setFresh(true);
  };

  return createPortal(
    <dialog
      ref={dialog}
      className="sheet"
      aria-label={label}
      onClose={onClose}
      onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
    >
      <div className="sheet-body keypad">
        <div className="pad-label">{label}</div>
        <div className="pad-value">{value || '0'}</div>
        <div className="pad-steps">
          <button type="button" className="pad-key step" aria-label={s.decrease} onClick={() => stepBy(-1)}>
            −
          </button>
          <button type="button" className="pad-key step" aria-label={s.increase} onClick={() => stepBy(1)}>
            +
          </button>
        </div>
        <div className="pad-grid">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
            <button key={key} type="button" className="pad-key" onClick={() => type(key)}>
              {key}
            </button>
          ))}
          {decimal ? (
            <button type="button" className="pad-key" onClick={() => type(decimal)}>
              {decimal}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="pad-key" onClick={() => type('0')}>
            0
          </button>
          <button
            type="button"
            className="pad-key"
            aria-label={s.backspace}
            onClick={() => {
              onChange(value.slice(0, -1));
              setFresh(false);
            }}
          >
            ⌫
          </button>
        </div>
        <button type="button" className="btn-primary" onClick={() => dialog.current?.close()}>
          {s.done}
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
