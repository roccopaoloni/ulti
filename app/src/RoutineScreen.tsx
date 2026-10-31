import { completeRoutine, dayColour, moveItem, nextDayColour, suggestedWeeklyTarget, withDayColours, type RoutineDay } from '@ulti/rules';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { dayColourVar } from './dayColour.ts';
import { useI18n } from './i18n.ts';
import { ExercisePicker } from './ExercisePicker.tsx';
import { Sheet } from './GroupsScreens.tsx';
import { chevronIcon, closeIcon, gripIcon } from './icons.tsx';
import { Info } from './Info.tsx';
import { navigate, paths, routinePath } from './navigation.ts';
import { SubScreen } from './SubScreen.tsx';
import type { Exercise, Profile, Training } from './training.ts';
import { useSortable } from './useSortable.ts';

// The Train hub's button to the Routine editor.
export function MyRoutineButton({ training }: { training: Training }) {
  const { t } = useI18n();
  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    training.routine().then((routine) => setDays(routine?.days.length ?? 0));
  }, [training]);
  return (
    <button type="button" className="hub-link" onClick={() => navigate(routinePath)}>
      <span className="disp">{t.routine.title}</span>
      {days ? <small className="muted">{t.routine.summary(days)}</small> : null}
      {chevronIcon}
    </button>
  );
}

// A number the lifter steps up and down with − and +, like the logging screen's keypad.
function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const { t } = useI18n();
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <div className="stepper-row">
        <button type="button" aria-label={t.routine.less(label)} disabled={value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <output aria-label={label}>{value}</output>
        <button type="button" aria-label={t.routine.more(label)} disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

type Rows = {
  day: RoutineDay;
  dayIndex: number;
  open: { dayId: string; index: number } | null;
  setOpen: (open: { dayId: string; index: number } | null) => void;
  nameOf: (exerciseId: string) => string;
  equipmentOf: (exerciseId: string) => string;
  changeDay: (index: number, change: Partial<RoutineDay>) => void;
  changeExercise: (dayIndex: number, index: number, change: Partial<RoutineDay['exercises'][number]>) => void;
  setPicking: (picking: { dayIndex: number; index?: number }) => void;
};

// A Day's Exercises, one compact row each. Tapping a row opens it to step its Sets and Rep Range.
function ExerciseRows({ day, dayIndex, open, setOpen, nameOf, equipmentOf, changeDay, changeExercise, setPicking }: Rows) {
  const { t } = useI18n();
  const r = t.routine;
  const sortable = useSortable((from, to) => {
    setOpen(null);
    changeDay(dayIndex, { exercises: moveItem(day.exercises, from, to) });
  });
  return (
    <div className="routine-rows" ref={sortable.list}>
      {day.exercises.map((e, index) => {
        const isOpen = open?.dayId === day.id && open.index === index;
        return (
          <div key={index} className="rex" {...sortable.item(index)}>
            <div className="rex-row">
              <button type="button" className="rex-main" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : { dayId: day.id, index })}>
                <span className="rex-text">
                  <span className="rex-name">{nameOf(e.exerciseId)}</span>
                  <small className="muted">{equipmentOf(e.exerciseId)}</small>
                </span>
                <span className="rex-sets">
                  {e.sets} × {e.repMin}–{e.repMax}
                </span>
              </button>
              <button
                type="button"
                className="quiet"
                aria-label={r.removeExercise}
                onClick={() => {
                  setOpen(null);
                  changeDay(dayIndex, { exercises: day.exercises.filter((_, i) => i !== index) });
                }}
              >
                {closeIcon}
              </button>
              <span className="grip" role="button" aria-label={r.moveExercise} {...sortable.handle(index)}>
                {gripIcon}
              </span>
            </div>
            {isOpen && (
              <div className="rex-edit">
                <button type="button" className="rex-change" onClick={() => setPicking({ dayIndex, index })}>
                  {r.exercise}
                </button>
                <div className="rex-steps">
                  <Stepper label={r.sets} value={e.sets} min={1} max={20} onChange={(sets) => changeExercise(dayIndex, index, { sets })} />
                  <Stepper label={r.repMin} value={e.repMin} min={1} max={e.repMax} onChange={(repMin) => changeExercise(dayIndex, index, { repMin })} />
                  <Stepper label={r.repMax} value={e.repMax} min={e.repMin} max={50} onChange={(repMax) => changeExercise(dayIndex, index, { repMax })} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// The Routine editor: its Days as cards, each Exercise a row that opens to step its Sets and Rep
// Range. Every change is saved on the phone at once; the Routine syncs whenever it is whole.
export function RoutineScreen({ training, profile, onProfileSaved }: { training: Training; profile: Profile | null; onProfileSaved: () => void }) {
  const { t, language } = useI18n();
  const r = t.routine;
  const [draft, setDraft] = useState<RoutineDay[] | null>(null);
  // How many Days the saved Routine has, for the Weekly Target it suggests.
  const [savedDays, setSavedDays] = useState(0);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  // What the picker is for: more Exercises for a Day (no `index`), or a new one for a row.
  const [picking, setPicking] = useState<{ dayIndex: number; index?: number } | null>(null);
  // The row open for editing its Sets and Rep Range.
  const [open, setOpen] = useState<{ dayId: string; index: number } | null>(null);
  const [removing, setRemoving] = useState<RoutineDay | null>(null);
  // The Days shown open: those added this visit and those that needed fixing when it began.
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
  const removeDialog = useRef<HTMLDialogElement>(null);
  // Saves go one after another, so the last edit is the one that stays.
  const writing = useRef<Promise<unknown>>(Promise.resolve());

  const days = useSortable((from, to) => {
    setOpen(null);
    edit(moveItem(draft!, from, to));
  });

  useEffect(() => {
    training.routineDraft().then((days) => {
      setDraft(withDayColours(days));
      setUnfolded(new Set(days.filter((day) => day.name.trim() === '' || day.exercises.length === 0).map((day) => day.id)));
    });
    training.routine().then((routine) => setSavedDays(routine?.days.length ?? 0));
    training.exercises().then(setCatalog);
  }, [training]);

  if (!draft) return null;
  const nameOf = (exercise: Exercise) => (language === 'es' ? exercise.nameEs : exercise.nameEn);
  const exerciseOf = (id: string) => catalog.find((candidate) => candidate.id === id);
  const whole = completeRoutine(draft);
  const suggested = savedDays > 0 ? suggestedWeeklyTarget(savedDays) : null;
  const current = profile?.weeklyTarget.at(-1)?.value;

  function edit(next: RoutineDay[]) {
    setDraft(next);
    const complete = completeRoutine(next);
    if (complete) setSavedDays(complete.length);
    writing.current = writing.current.then(() => training.saveRoutineDraft(next));
  }
  const changeDay = (index: number, change: Partial<RoutineDay>) => edit(draft!.map((day, i) => (i === index ? { ...day, ...change } : day)));
  const changeExercise = (dayIndex: number, index: number, change: Partial<RoutineDay['exercises'][number]>) =>
    changeDay(dayIndex, { exercises: draft![dayIndex].exercises.map((e, i) => (i === index ? { ...e, ...change } : e)) });

  return (
    <>
      {draft.length === 0 ? (
        <p className="muted">{r.empty}</p>
      ) : (
        <p className="muted routine-status" role="status">
          {whole ? r.synced : r.held}
        </p>
      )}
      <div className="routine" ref={days.list}>
        {draft.map((day, dayIndex) => (
          <div
            key={day.id}
            className="card routine-day"
            {...days.item(dayIndex)}
            style={{ ...days.item(dayIndex).style, '--c': dayColourVar(dayColour(draft, dayIndex)) } as CSSProperties}
          >
            <div className="routine-day-head">
              <div className="routine-day-title">
                <div className="eyebrow">
                  {r.day(dayIndex + 1)} {dayIndex === 0 && <Info term="routine" />}
                </div>
                <input
                  className="routine-name"
                  aria-label={r.dayName}
                  placeholder={r.dayName}
                  value={day.name}
                  onChange={(event) => changeDay(dayIndex, { name: event.target.value })}
                />
                {!unfolded.has(day.id) && <small className="muted">{r.exerciseCount(day.exercises.length)}</small>}
              </div>
              {unfolded.has(day.id) && (
                <button
                  type="button"
                  className="quiet"
                  aria-label={r.removeDay}
                  onClick={() => {
                    setRemoving(day);
                    removeDialog.current?.showModal();
                  }}
                >
                  {closeIcon}
                </button>
              )}
              <span className="grip" role="button" aria-label={r.moveDay} {...days.handle(dayIndex)}>
                {gripIcon}
              </span>
              <button
                type="button"
                className="quiet routine-fold"
                aria-label={unfolded.has(day.id) ? r.collapseDay : r.expandDay}
                aria-expanded={unfolded.has(day.id)}
                onClick={() => {
                  setOpen(null);
                  setUnfolded((was) => {
                    const next = new Set(was);
                    if (!next.delete(day.id)) next.add(day.id);
                    return next;
                  });
                }}
              >
                {chevronIcon}
              </button>
            </div>
            {unfolded.has(day.id) && (
              <div className="routine-day-body">
            {day.name.trim() === '' && <p className="routine-hint">{r.needsName}</p>}
            {day.exercises.length === 0 && <p className="routine-hint">{r.needsExercises}</p>}
            <ExerciseRows
              day={day}
              dayIndex={dayIndex}
              open={open}
              setOpen={setOpen}
              nameOf={(id) => { const exercise = exerciseOf(id); return exercise ? nameOf(exercise) : id; }}
              equipmentOf={(id) => { const exercise = exerciseOf(id); return exercise?.equipment ? t.session.equipment[exercise.equipment] : t.session.customTag; }}
              changeDay={changeDay}
              changeExercise={changeExercise}
              setPicking={setPicking}
            />
            <button type="button" className="btn-ghost" onClick={() => setPicking({ dayIndex })}>
              {r.addExercise}
            </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="btn-ghost" onClick={() => {
          const id = crypto.randomUUID();
          setUnfolded((was) => new Set(was).add(id));
          edit([...draft, { id, name: '', colour: nextDayColour(draft), exercises: [] }]);
        }}>
        {r.addDay}
      </button>
      {suggested !== null && suggested !== current && (
        <div className="card">
          <p>
            {r.suggestion(suggested)} <Info term="weeklyTarget" />
          </p>
          <button
            type="button"
            className="btn-ghost"
            onClick={async () => {
              await training.setProfile('weeklyTarget', suggested);
              onProfileSaved();
            }}
          >
            {r.useSuggestion}
          </button>
        </div>
      )}
      <Sheet dialog={removeDialog} label={r.removeDayTitle}>
        <h2 className="disp sheet-title">{r.removeDayTitle}</h2>
        <p>{r.removeDayText(removing?.name.trim() ?? '')}</p>
        <button
          type="button"
          className="btn-danger"
          onClick={() => {
            removeDialog.current?.close();
            if (removing) {
              setOpen(null);
              edit(draft.filter((day) => day.id !== removing.id));
            }
          }}
        >
          {r.removeDayConfirm}
        </button>
        <form method="dialog">
          <button className="btn-ghost">{r.cancel}</button>
        </form>
      </Sheet>
      <ExercisePicker
        open={picking !== null}
        catalog={catalog}
        multiple={picking?.index === undefined}
        onPick={(ids) => {
          const { dayIndex, index } = picking!;
          setPicking(null);
          if (index !== undefined) return changeExercise(dayIndex, index, { exerciseId: ids[0] });
          const added = ids.map((exerciseId) => ({ exerciseId, sets: 3, repMin: 8, repMax: 12 }));
          changeDay(dayIndex, { exercises: [...draft[dayIndex].exercises, ...added] });
        }}
        onCreate={async (exerciseName, muscle) => {
          const { id } = await training.createExercise(exerciseName, muscle);
          setCatalog(await training.exercises());
          return id;
        }}
        onClose={() => setPicking(null)}
      />
    </>
  );
}

export function RoutineSubScreen(props: { training: Training; profile: Profile | null; onProfileSaved: () => void }) {
  const { t } = useI18n();
  return (
    <SubScreen title={t.routine.title} parent={paths.train}>
      <RoutineScreen {...props} />
    </SubScreen>
  );
}
