import { deloadRows, incrementInUnits, kgToUnits, labelSets, plannedRows, predictLabels, stepValue, unitsToKg, type Recommendation,type PersonalRecord, type RoutineExercise, type SetLabel, type Units } from '@ulti/rules';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from './i18n.ts';
import { checkIcon, undoIcon } from './icons.tsx';
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
  dumbbell,
  units,
  target,
  sets,
  records,
  calibrating,
  custom,
  focus,
  deload,
  onLog,
  asksRir,
  onSetLabel,
  onRir,
  onUnlog,
  onIncrement,
}: {
  name: string;
  training: Training;
  exerciseId: string;
  incrementKg: number;
  // A bodyweight Exercise: its weight is the weight added to the lifter's own, shown as "BW +10 kg".
  bodyweight: boolean;
  // A dumbbell Exercise: its weight is per dumbbell, as it is stored and scored.
  dumbbell: boolean;
  units: Units;
  // What the Routine plans for this Exercise, when the Session came from one.
  target?: RoutineExercise;
  sets: SetRecord[];
  // The Personal Records among the Sets, by Set ID, and whether the Exercise is still in Calibration.
  records: Map<string, PersonalRecord>;
  calibrating: boolean;
  // A Custom Exercise has no Increment to set and gets no recommendations.
  custom: boolean;
  // The Focus layout: one Set at a time, instead of every row (design: Logging a Session).
  focus?: boolean;
  // This week is a Deload Week: about half the Sets, about 10% lighter, and no go heavier or Stall advice.
  deload?: boolean;
  // Logs the Set and returns its ID.
  onLog: (weightKg: number, reps: number, label: SetLabel) => Promise<string>;
  // Whether RIR is asked after this logged Set (design: Logging a Session).
  asksRir: (setId: string) => boolean;
  onSetLabel: (setId: string, label: SetLabel) => Promise<void>;
  onRir: (setId: string, rir: number) => Promise<void>;
  // Un-logs a Set: it is removed.
  onUnlog: (setId: string) => Promise<void>;
  onIncrement: (incrementKg: number) => Promise<void>;
}) {
  const { t, language, formatNumber } = useI18n();
  const decimalKey = language === 'es' ? ',' : '.';
  const labels = labelSets(sets);
  // The last Session's Sets and the recommendation (go heavier or Stall), loaded together so the
  // rows are pre-filled once. Accepting is leaving the pre-filled weight; dismissing restores the last Sets.
  const [loaded, setLoaded] = useState<{ last: Planned[]; advice: Recommendation | undefined } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    Promise.all([training.lastSets(exerciseId), target ? training.recommendation(exerciseId, target) : undefined]).then(([last, advice]) =>
      setLoaded({ last, advice }),
    );
  }, [training, exerciseId, target, incrementKg]);
  // In a Deload Week the advice waits: the rows are the regular Session's, about half and 10% lighter.
  const advice = dismissed || deload ? undefined : loaded?.advice;
  const heavier = advice?.kind === 'goHeavier' ? advice : undefined;
  const stall = advice?.kind === 'stall' ? advice : undefined;
  const last = loaded && (advice ? loaded.last.map(() => ({ weightKg: advice.weightKg, reps: advice.reps })) : loaded.last);

  // The chips asking for RIR stay after ✓ until answered or until the next Set is logged.
  const [askRir, setAskRir] = useState<string | null>(null);
  // The Set just un-logged: the row to do comes back with its numbers and label, until it is logged again.
  const [unlogged, setUnlogged] = useState<{ weightKg: number; reps: number; label: SetLabel } | null>(null);
  const unlog = async (index: number) => {
    const set = sets[index]!;
    setAskRir(null);
    setUnlogged({ weightKg: set.weightKg, reps: set.reps, label: labels[index]! });
    await onUnlog(set.id);
  };
  const [editingIncrement, setEditingIncrement] = useState<string | null>(null);

  // Past the plan, the next Set repeats the last one logged.
  const regularPlan = last && plannedRows(last, target?.sets);
  const plan = deload && regularPlan ? deloadRows(regularPlan, incrementKg) : regularPlan;
  const next = unlogged ?? (plan ? (plan[sets.length] ?? sets.at(-1)) : undefined);
  // The labels the rows still to do would get, from the plan: the next row first, as the lifter edits it.
  const upcoming = plan?.slice(sets.length + 1) ?? [];
  const predicted = (nextRow: { weightKg: number; label?: SetLabel } | undefined) =>
    predictLabels(sets, [...(nextRow ? [nextRow] : []), ...upcoming.flatMap((row) => (row ? [row] : []))]);
  const labelFor = (weightKg: number, chosen?: SetLabel) => predicted({ weightKg, label: chosen })[0]!;
  const ahead = predicted(next).slice(next ? 1 : 0);
  const upcomingLabels = upcoming.map((row) => (row ? ahead.shift() : undefined));
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
    <section className={focus ? 'ex focus' : 'ex'}>
      <h2 className="ex-name">{name}</h2>
      {calibrating && (
        <p className="calibration">
          {t.session.calibration} <Info term="calibration" />
        </p>
      )}
      {dumbbell && <p className="per-dumbbell">{t.session.perDumbbell}</p>}
      {target && <p className="muted">{t.session.target(target.sets, target.repMin, target.repMax)}</p>}
      {!custom && (
        <button
          type="button"
          className="btn-link inline increment"
          onClick={() => setEditingIncrement(String(incrementInUnits(incrementKg, units)).replace('.', decimalKey))}
        >
          {t.session.increment(formatNumber(incrementInUnits(incrementKg, units), 2), units)}
        </button>
      )}
      {heavier && sets.length === 0 && (
        <p className="go-heavier">
          <span className="badge">
            ↑ +{formatNumber(incrementInUnits(heavier.incrementKg, units), 2)} {units}
          </span>
          <button type="button" className="btn-link inline" onClick={() => setDismissed(true)}>
            {t.session.dismissGoHeavier}
          </button>
        </p>
      )}
      {stall && sets.length === 0 && (
        <p className="go-heavier">
          <span className="badge">↓ {t.session.stall(formatNumber(kgToUnits(stall.weightKg, units), 2), units)}</span>
          <button type="button" className="btn-link inline" onClick={() => setDismissed(true)}>
            {t.session.dismissStall}
          </button>
        </p>
      )}
      {!focus && sets.map((set, index) => (
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
          <button type="button" className="check" aria-label={t.session.unlogSet} onClick={() => unlog(index)}>
            {records.has(set.id) ? <small className="pr-points">{t.session.points(records.get(set.id)!.progressPoints)}</small> : checkIcon}
          </button>
        </div>
      ))}
      {askRir && sets.some((set) => set.id === askRir) && asksRir(askRir) && (
        <div className="rir" role="group" aria-label={t.session.rir}>
          <span className="muted">RIR</span>
          <Info term="rir" />
          {[0, 1, 2, 3, 4].map((rir) => (
            <button
              key={rir}
              type="button"
              className="rir-chip"
              onClick={() => {
                setAskRir(null);
                onRir(askRir, rir);
              }}
            >
              {rir === 4 ? '4+' : rir}
            </button>
          ))}
        </div>
      )}
      {focus && plan && (
        <FocusSets
          count={Math.max(plan.length, sets.length + 1)}
          sets={sets}
          labels={labels}
          upcomingLabels={upcomingLabels}
          records={records}
          plan={plan}
          next={next}
          bodyweight={bodyweight}
          units={units}
          nextSet={
            <NextSet
              key={`${sets.length}-${heavier ? 'heavier' : ''}`}
              focus
              number={sets.length + 1}
              planned={next}
              chosenLabel={unlogged?.label}
              incrementKg={incrementKg}
              bodyweight={bodyweight}
              dumbbell={dumbbell}
              units={units}
              labelFor={labelFor}
              onLog={async (weightKg, reps, label) => {
                setUnlogged(null);
                setAskRir(await onLog(weightKg, reps, label));
              }}
            />
          }
          onSetLabel={onSetLabel}
          onUnlog={unlog}
        />
      )}
      {!focus && plan && (
        <NextSet
          key={`${sets.length}-${heavier ? 'heavier' : ''}`}
          number={sets.length + 1}
          planned={next}
          chosenLabel={unlogged?.label}
          incrementKg={incrementKg}
          bodyweight={bodyweight}
          dumbbell={dumbbell}
          units={units}
          labelFor={labelFor}
          onLog={async (weightKg, reps, label) => {
            setUnlogged(null);
            setAskRir(await onLog(weightKg, reps, label));
          }}
        />
      )}
      {editingIncrement !== null && (
        <Keypad
          label={t.session.incrementLabel}
          value={editingIncrement}
          decimal={decimalKey}
          step={0.5}
          onChange={setEditingIncrement}
          onClose={() => {
            const typed = Number(editingIncrement.replace(',', '.'));
            setEditingIncrement(null);
            // Confirming the value the sheet opened with saves nothing, so kg is not rewritten by rounding.
            if (typed > 0 && typed !== incrementInUnits(incrementKg, units)) onIncrement(unitsToKg(typed, units));
          }}
        />
      )}
      {!focus && upcoming.map((set, index) => (
        <div key={index} className="set upcoming" aria-hidden="true">
          <span className={`tag label-${upcomingLabels[index] ?? 'working'}`}>
            {sets.length + index + 2}
            {upcomingLabels[index] && <small>{upcomingLabels[index] === 'warm-up' ? t.session.warmUp : t.session.working}</small>}
          </span>
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
  chosenLabel,
  incrementKg,
  bodyweight,
  dumbbell,
  units,
  focus,
  labelFor,
  onLog,
}: {
  number: number;
  focus?: boolean;
  planned: Planned | undefined;
  // The label an un-logged Set had, which the row keeps until the lifter changes it.
  chosenLabel?: SetLabel;
  incrementKg: number;
  bodyweight: boolean;
  dumbbell: boolean;
  units: Units;
  // The label this row would get at this weight, unless the lifter chose one.
  labelFor: (weightKg: number, chosen?: SetLabel) => SetLabel;
  onLog: (weightKg: number, reps: number, label: SetLabel) => Promise<void>;
}) {
  const { t, language } = useI18n();
  const s = t.session;
  // The keypad's decimal key matches the language (design: Numbers).
  const decimal = language === 'es' ? ',' : '.';
  const [weight, setWeight] = useState(planned ? String(Math.round(kgToUnits(planned.weightKg, units) * 100) / 100).replace('.', decimal) : bodyweight ? '0' : '');
  const [reps, setReps] = useState(planned ? String(planned.reps) : '');
  const [editing, setEditing] = useState<'weight' | 'reps' | null>(null);
  const [busy, setBusy] = useState(false);
  // The lifter's tap on the label: it sticks, and the weight no longer changes it.
  const [chosen, setChosen] = useState<SetLabel | undefined>(chosenLabel);

  const typedWeight = Number(weight.replace(',', '.'));
  const weightKg = unitsToKg(typedWeight, units);
  const label = labelFor(Number.isFinite(weightKg) ? weightKg : 0, chosen);
  const valid = weight.trim() !== '' && Number.isFinite(typedWeight) && typedWeight >= 0 && /^[1-9]\d*$/.test(reps);

  async function log() {
    if (!valid || busy) return;
    setBusy(true);
    await onLog(weightKg, Number(reps), label);
    setBusy(false);
  }

  const keypad = editing && (
    <Keypad
      label={editing === 'weight' ? (bodyweight ? s.addedWeight : dumbbell ? s.perDumbbell : s.weight) : s.reps}
      value={editing === 'weight' ? weight : reps}
      decimal={editing === 'weight' ? decimal : null}
      step={editing === 'weight' ? incrementInUnits(incrementKg, units) : 1}
      onChange={editing === 'weight' ? setWeight : setReps}
      onClose={() => setEditing(null)}
    />
  );

  const flip = () => setChosen(label === 'warm-up' ? 'working' : 'warm-up');
  const labelText = label === 'warm-up' ? s.warmUp : s.working;

  if (focus) {
    return (
      <>
        <div className="f-nums">
          <button type="button" className="f-num" aria-label={bodyweight ? s.addedWeight : dumbbell ? s.perDumbbell : s.weight} onClick={() => setEditing('weight')}>
            <span className="num">
              {bodyweight && 'BW +'}
              {weight || '–'}
            </span>
            <span className="unit">{units}</span>
          </button>
          <span className="f-x">×</span>
          <button type="button" className="f-num" aria-label={s.reps} onClick={() => setEditing('reps')}>
            <span className="num">{reps || '–'}</span>
            <span className="unit">{s.reps}</span>
          </button>
        </div>
        <button type="button" className="btn-primary f-done" disabled={!valid || busy} onClick={log}>
          {checkIcon} {s.done}
        </button>
        <div className="f-label">
          <button type="button" className={`tag label-${label}`} aria-label={s.flipLabel(labelText)} onClick={flip}>
            {number} <small>{labelText}</small>
          </button>
        </div>
        {keypad}
      </>
    );
  }

  return (
    <div className="set">
      <button type="button" className={`tag label-${label}`} aria-label={s.flipLabel(labelText)} onClick={flip}>
        {number}
        <small>{labelText}</small>
      </button>
      <button type="button" className="cell" aria-label={bodyweight ? s.addedWeight : dumbbell ? s.perDumbbell : s.weight} onClick={() => setEditing('weight')}>
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
      {keypad}
    </div>
  );
}

// The Focus layout of an Exercise: the Sets as chips, one Set in very large numbers, and previous /
// next to move between them. The Set still to do is the live NextSet; any other is shown as it is.
function FocusSets({
  count,
  sets,
  labels,
  upcomingLabels,
  records,
  plan,
  next,
  bodyweight,
  units,
  nextSet,
  onSetLabel,
  onUnlog,
}: {
  count: number;
  sets: SetRecord[];
  labels: SetLabel[];
  // The labels of the rows after the next one, as they would be logged.
  upcomingLabels: (SetLabel | undefined)[];
  records: Map<string, PersonalRecord>;
  plan: (Planned | undefined)[];
  next: Planned | undefined;
  bodyweight: boolean;
  units: Units;
  nextSet: React.ReactNode;
  onSetLabel: (setId: string, label: SetLabel) => Promise<void>;
  onUnlog: (index: number) => Promise<void>;
}) {
  const { t, formatNumber } = useI18n();
  const s = t.session;
  // Which Set is on show; until the lifter moves, the one still to do. Logging a Set returns to it.
  const [viewing, setViewing] = useState<{ at: number; loggedSets: number } | null>(null);
  const current = sets.length;
  const at = Math.min(viewing && viewing.loggedSets === current ? viewing.at : current, count - 1);
  const go = (index: number) => setViewing({ at: Math.max(0, Math.min(count - 1, index)), loggedSets: current });
  const weightText = (weightKg: number) => `${bodyweight ? 'BW +' : ''}${formatNumber(kgToUnits(weightKg, units), 2)}`;
  const planned = (index: number) => (index === current ? next : plan[index]);
  const shown = at < current ? sets[at] : planned(at);

  return (
    <>
      <div className="f-chips" role="group" aria-label={s.focusSets}>
        {Array.from({ length: count }, (_, index) => {
          const set = index < current ? sets[index] : planned(index);
          return (
            <button
              key={index}
              type="button"
              className={`f-chip${index < current ? ' done' : ''}${index === at ? ' cur' : ''}`}
              aria-label={s.focusSet(index + 1)}
              aria-current={index === at}
              onClick={() => go(index)}
            >
              {index < current && checkIcon}
              {set ? `${weightText(set.weightKg)} × ${set.reps}` : '–'}
            </button>
          );
        })}
      </div>
      {at === current ? (
        nextSet
      ) : (
        <>
          <div className="f-nums">
            <div className="f-num">
              <span className="num">{shown ? weightText(shown.weightKg) : '–'}</span>
              <span className="unit">{units}</span>
            </div>
            <span className="f-x">×</span>
            <div className="f-num">
              <span className="num">{shown?.reps ?? '–'}</span>
              <span className="unit">{s.reps}</span>
            </div>
          </div>
          {at < current ? (
            <button type="button" className="btn-ghost f-done f-unlog" onClick={() => onUnlog(at)}>
              {undoIcon} {s.unlogSet}
            </button>
          ) : (
            <button type="button" className="btn-primary f-done" disabled>
              {checkIcon} {s.done}
            </button>
          )}
        </>
      )}
      {at !== current && (
      <div className="f-label">
        {at < current ? (
          <button
            type="button"
            className={`tag label-${labels[at]}`}
            aria-label={s.flipLabel(labels[at] === 'warm-up' ? s.warmUp : s.working)}
            onClick={() => onSetLabel(sets[at]!.id, labels[at] === 'warm-up' ? 'working' : 'warm-up')}
          >
            {at + 1} <small>{labels[at] === 'warm-up' ? s.warmUp : s.working}</small>
          </button>
        ) : (
          <span className={`tag label-${upcomingLabels[at - current - 1] ?? 'working'}`}>
            {at + 1} {upcomingLabels[at - current - 1] && <small>{upcomingLabels[at - current - 1] === 'warm-up' ? s.warmUp : s.working}</small>}
          </span>
        )}
        {at < current && records.has(sets[at]!.id) && <small className="pr-points">{s.points(records.get(sets[at]!.id)!.progressPoints)}</small>}
      </div>
      )}
      <div className="f-nav">
        <button type="button" disabled={at === 0} onClick={() => go(at - 1)}>
          ‹ {s.previous}
        </button>
        <button type="button" disabled={at === count - 1} onClick={() => go(at + 1)}>
          {s.next} ›
        </button>
      </div>
    </>
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
