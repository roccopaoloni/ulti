import { kgToUnits, labelSets, unitsToKg, type PersonalRecord, type SetLabel, type Units } from '@ulti/rules';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Sheet } from './GroupsScreens.tsx';
import { useI18n } from './i18n.ts';
import type { Exercise, SetRecord, Training } from './training.ts';

type Past = Awaited<ReturnType<Training['pastSessions']>>[number];

// The Train tab's history: past Sessions, newest first. Opening one shows its Exercises and Sets,
// each of which can be fixed or deleted, offline too.
export function History({ training, units }: { training: Training; units: Units }) {
  const { t, language } = useI18n();
  const h = t.history;
  const [sessions, setSessions] = useState<Past[]>([]);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  // The Personal Records among all the Sets, by Set ID.
  const [records, setRecords] = useState(new Map<string, PersonalRecord>());

  const reload = useCallback(async () => {
    setSessions(await training.pastSessions());
    setRecords(new Map((await training.scoring()).events.map((event) => [event.setId, event])));
  }, [training]);
  useEffect(() => {
    reload();
    training.exercises().then(setCatalog);
  }, [training, reload]);

  const name = (id: string) => {
    const exercise = catalog.find((candidate) => candidate.id === id);
    return exercise ? (language === 'es' ? exercise.nameEs : exercise.nameEn) : id;
  };
  const date = (localDate: string) =>
    new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(localDate));

  if (sessions.length === 0) return <p className="muted">{h.empty}</p>;
  return (
    <section className="history">
      <h2 className="eyebrow">{h.title}</h2>
      {sessions.map(({ session, sets }) => {
        const open = openId === session.id;
        const exerciseIds = [...new Set(sets.map((set) => set.exerciseId))];
        const points = sets.reduce((sum, set) => sum + (records.get(set.id)?.progressPoints ?? 0), 0);
        // Each Set's label, worked out per Exercise as the logging screen does.
        const labels = new Map(
          exerciseIds.flatMap((exerciseId) => {
            const exerciseSets = sets.filter((set) => set.exerciseId === exerciseId);
            const exerciseLabels = labelSets(exerciseSets);
            return exerciseSets.map((set, index) => [set.id, exerciseLabels[index]] as const);
          }),
        );
        return (
          <div key={session.id} className="card">
            <button
              type="button"
              className="history-head"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : session.id)}
            >
              <strong>{date(session.localDate)}</strong>
              <span className="muted">
                {t.session.sets(sets.length)} · {h.points(points)}
              </span>
            </button>
            {open &&
              exerciseIds.map((exerciseId) => (
                <section key={exerciseId} className="ex">
                  <h3 className="history-ex">{name(exerciseId)}</h3>
                  {sets
                    .filter((set) => set.exerciseId === exerciseId)
                    .map((set) => (
                      <PastSet
                        key={set.id}
                        set={set}
                        label={labels.get(set.id)!}
                        exerciseName={name(exerciseId)}
                        units={units}
                        bodyweight={catalog.find(({ id }) => id === exerciseId)?.bodyweight ?? false}
                        record={records.get(set.id)}
                        onEdit={async (weightKg, reps) => {
                          await training.editSet(set.id, weightKg, reps);
                          await reload();
                        }}
                        onDelete={async () => {
                          await training.deleteSet(set.id);
                          await reload();
                        }}
                      />
                    ))}
                </section>
              ))}
          </div>
        );
      })}
    </section>
  );
}

function PastSet({
  set,
  label,
  exerciseName,
  units,
  bodyweight,
  record,
  onEdit,
  onDelete,
}: {
  set: SetRecord;
  label: SetLabel;
  exerciseName: string;
  units: Units;
  bodyweight: boolean;
  record: PersonalRecord | undefined;
  onEdit: (weightKg: number, reps: number) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t, language, formatNumber } = useI18n();
  const h = t.history;
  const [editing, setEditing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const typed = String(Math.round(kgToUnits(set.weightKg, units) * 100) / 100).replace('.', language === 'es' ? ',' : '.');
  const [weight, setWeight] = useState(typed);
  const [reps, setReps] = useState(String(set.reps));

  const typedWeight = Number(weight.replace(',', '.'));
  const weightKg = unitsToKg(typedWeight, units);
  const valid = weight.trim() !== '' && Number.isFinite(typedWeight) && typedWeight >= 0 && /^[1-9]\d*$/.test(reps);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    await onEdit(weightKg, Number(reps));
    setEditing(false);
  }

  const load = bodyweight
    ? t.session.bodyweightLoad(set.weightKg ? `${formatNumber(kgToUnits(set.weightKg, units), 2)} ${units}` : '')
    : `${formatNumber(kgToUnits(set.weightKg, units), 2)} ${units}`;

  if (!editing) {
    return (
      <>
        <div className="past-set">
          <span>
            <span className={`tag past-tag label-${label}`}>
              <small>{label === 'warm-up' ? t.session.warmUp : t.session.working}</small>
            </span>
            {load}{' '}
            × {set.reps}
            {record && ` · PR +${record.percentGain}% · ${t.session.points(record.progressPoints)}`}
          </span>
          <button type="button" className="btn-link" onClick={() => setEditing(true)}>
            {h.edit}
          </button>
          <button type="button" className="btn-link" onClick={() => dialog.current?.showModal()}>
            {h.delete}
          </button>
        </div>
        <Sheet dialog={dialog} label={h.deleteTitle}>
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
          <form method="dialog">
            <button className="btn-ghost">{h.cancel}</button>
          </form>
        </Sheet>
      </>
    );
  }
  return (
    <form className="past-set" onSubmit={save}>
      <input
        inputMode="decimal"
        autoComplete="off"
        aria-label={bodyweight ? t.session.addedWeight : t.session.weight}
        value={weight}
        onChange={(event) => setWeight(event.target.value.replace(/[^\d.,]/g, ''))}
      />
      <span>×</span>
      <input
        inputMode="numeric"
        autoComplete="off"
        aria-label={t.session.reps}
        value={reps}
        onChange={(event) => setReps(event.target.value.replace(/\D/g, ''))}
      />
      <button className="btn-link" disabled={!valid}>
        {h.save}
      </button>
      <button type="button" className="btn-link" onClick={() => setEditing(false)}>
        {h.cancel}
      </button>
    </form>
  );
}
