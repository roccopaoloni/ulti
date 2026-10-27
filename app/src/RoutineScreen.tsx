import { suggestedWeeklyTarget, type RoutineDay } from '@ulti/rules';
import { useEffect, useState } from 'react';
import { useI18n } from './i18n.ts';
import { Info } from './Info.tsx';
import type { Exercise, Profile, Training } from './training.ts';

// A Routine Day as it is typed: the numbers stay text until saved, so a field can be empty meanwhile.
type DraftDay = {
  id: string;
  name: string;
  exercises: { exerciseId: string; sets: string; repMin: string; repMax: string }[];
};

const toDraft = (days: RoutineDay[]): DraftDay[] =>
  days.map((day) => ({
    ...day,
    exercises: day.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: String(e.sets), repMin: String(e.repMin), repMax: String(e.repMax) })),
  }));

const whole = (text: string) => (/^[1-9]\d{0,2}$/.test(text) ? Number(text) : null);

// Null until every Day is named and has Exercises with Sets and a Rep Range that makes sense.
function toRoutine(draft: DraftDay[]): RoutineDay[] | null {
  if (draft.length === 0) return null;
  const days: RoutineDay[] = [];
  for (const day of draft) {
    if (day.name.trim() === '' || day.exercises.length === 0) return null;
    const exercises = [];
    for (const e of day.exercises) {
      const sets = whole(e.sets);
      const repMin = whole(e.repMin);
      const repMax = whole(e.repMax);
      if (!e.exerciseId || sets === null || repMin === null || repMax === null || repMin > repMax) return null;
      exercises.push({ exerciseId: e.exerciseId, sets, repMin, repMax });
    }
    days.push({ id: day.id, name: day.name.trim(), exercises });
  }
  return days;
}

// The Train tab's Routine: its Sessions, each with Exercises, a number of Sets and a Rep Range. It
// suggests a Weekly Target, which the lifter can take.
export function RoutineEditor({
  training,
  profile,
  onProfileSaved,
}: {
  training: Training;
  profile: Profile | null;
  onProfileSaved: () => void;
}) {
  const { t, language } = useI18n();
  const r = t.routine;
  const [draft, setDraft] = useState<DraftDay[] | null>(null);
  const [saved, setSaved] = useState<RoutineDay[]>([]);
  const [catalog, setCatalog] = useState<Exercise[]>([]);

  useEffect(() => {
    training.routine().then((routine) => {
      setSaved(routine?.days ?? []);
      setDraft(toDraft(routine?.days ?? []));
    });
    training.exercises().then(setCatalog);
  }, [training]);

  if (!draft) return null;
  const nameOf = (exercise: Exercise) => (language === 'es' ? exercise.nameEs : exercise.nameEn);
  const equipmentOf = (exercise: Exercise) => (exercise.equipment ? ` (${t.session.equipment[exercise.equipment] ?? ''})` : '');
  const choices = [...catalog].sort((a, b) => nameOf(a).localeCompare(nameOf(b), language));
  const routine = toRoutine(draft);
  const suggested = saved.length > 0 ? suggestedWeeklyTarget(saved.length) : null;
  const current = profile?.weeklyTarget.at(-1)?.value;

  const changeDay = (index: number, change: Partial<DraftDay>) =>
    setDraft(draft.map((day, i) => (i === index ? { ...day, ...change } : day)));
  const changeExercise = (dayIndex: number, index: number, change: Partial<DraftDay['exercises'][number]>) =>
    changeDay(dayIndex, { exercises: draft[dayIndex].exercises.map((e, i) => (i === index ? { ...e, ...change } : e)) });

  async function save() {
    if (!routine) return;
    await training.saveRoutine(routine);
    setSaved(routine);
  }

  return (
    <section className="routine">
      <h2 className="eyebrow">
        {r.title} <Info term="routine" />
      </h2>
      {draft.length === 0 && <p className="muted">{r.empty}</p>}
      {draft.map((day, dayIndex) => (
        <div key={day.id} className="card">
          <div className="field">
            <label htmlFor={`day-${day.id}`}>{r.day(dayIndex + 1)}</label>
            <input id={`day-${day.id}`} aria-label={r.dayName} value={day.name} onChange={(event) => changeDay(dayIndex, { name: event.target.value })} />
          </div>
          {day.exercises.map((e, index) => (
            <div key={index} className="routine-ex">
              <select
                aria-label={r.exercise}
                value={e.exerciseId}
                onChange={(event) => changeExercise(dayIndex, index, { exerciseId: event.target.value })}
              >
                <option value="">{r.pickExercise}</option>
                {choices.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {nameOf(exercise)}
                    {equipmentOf(exercise)}
                  </option>
                ))}
              </select>
              <div className="routine-nums">
                <label>
                  {r.sets}
                  <input inputMode="numeric" value={e.sets} onChange={(event) => changeExercise(dayIndex, index, { sets: event.target.value })} />
                </label>
                <span className="muted">{r.repRange}</span>
                <label>
                  {r.from}
                  <input inputMode="numeric" value={e.repMin} onChange={(event) => changeExercise(dayIndex, index, { repMin: event.target.value })} />
                </label>
                <label>
                  {r.to}
                  <input inputMode="numeric" value={e.repMax} onChange={(event) => changeExercise(dayIndex, index, { repMax: event.target.value })} />
                </label>
              </div>
              <button
                type="button"
                className="btn-link"
                onClick={() => changeDay(dayIndex, { exercises: day.exercises.filter((_, i) => i !== index) })}
              >
                {r.removeExercise}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => changeDay(dayIndex, { exercises: [...day.exercises, { exerciseId: '', sets: '3', repMin: '8', repMax: '12' }] })}
          >
            {r.addExercise}
          </button>
          <button type="button" className="btn-link" onClick={() => setDraft(draft.filter((_, i) => i !== dayIndex))}>
            {r.removeDay}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setDraft([...draft, { id: crypto.randomUUID(), name: '', exercises: [] }])}
      >
        {r.addDay}
      </button>
      <button type="button" className="btn-primary" disabled={!routine} onClick={save}>
        {r.save}
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
    </section>
  );
}
