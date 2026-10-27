import { isProfileValue, kgToUnits, unitsToKg, valueInForce, type Sex, type Units } from '@ulti/rules';
import { useEffect, useState, type FormEvent } from 'react';
import { Field } from './AuthScreens.tsx';
import { refreshVisibility, saveVisibility, useVisibility, type Visibility } from './groups.ts';
import { useI18n, type Language } from './i18n.ts';
import { Info } from './Info.tsx';
import { setLanguage, setLayout, setUnits, today, useLayout, type Layout } from './profile.ts';
import type { Profile, Training } from './training.ts';

const sexes: Sex[] = ['male', 'female', 'unspecified'];
const targets = [2, 3, 4, 5, 6];

// One choice among a few, as a row of buttons.
function Choice<T extends string | number>({
  label,
  info,
  options,
  value,
  onChange,
}: {
  label: string;
  info?: React.ReactNode;
  options: { value: T; text: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div className="field">
      <span className="label">
        {label} {info}
      </span>
      <div className="choices" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            className="chip"
            aria-checked={option.value === value}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function UnitsChoice({ value, onChange }: { value: Units; onChange: (units: Units) => void }) {
  const { t } = useI18n();
  return (
    <Choice
      label={t.body.units}
      options={[
        { value: 'kg', text: 'kg' },
        { value: 'lb', text: 'lb' },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

type Draft = { sex: Sex | null; bodyweight: string; target: number };

// Sex, bodyweight and Weekly Target: asked in onboarding and changed in Profile.
function BodyFields({ units, draft, onChange }: { units: Units; draft: Draft; onChange: (draft: Draft) => void }) {
  const { t } = useI18n();
  const b = t.body;
  return (
    <>
      <Choice
        label={b.sex}
        options={sexes.map((sex) => ({ value: sex, text: b[sex] }))}
        value={draft.sex}
        onChange={(sex) => onChange({ ...draft, sex })}
      />
      <Field
        label={b.bodyweight(units)}
        inputMode="decimal"
        autoComplete="off"
        value={draft.bodyweight}
        onChange={(event) => onChange({ ...draft, bodyweight: event.target.value.replace(/[^\d.,]/g, '') })}
      />
      <Choice
        label={b.weeklyTarget}
        info={<Info term="weeklyTarget" />}
        options={targets.map((count) => ({ value: count, text: b.sessionsPerWeek(count) }))}
        value={draft.target}
        onChange={(target) => onChange({ ...draft, target })}
      />
    </>
  );
}

// The bodyweight typed, in kg to two decimals, or null while it isn't one a field can hold.
function typedBodyweightKg(text: string, units: Units) {
  const kg = Math.round(unitsToKg(Number(text.replace(',', '.')), units) * 100) / 100;
  return text.trim() !== '' && isProfileValue('bodyweightKg', kg) ? kg : null;
}

async function saveBody(training: Training, current: Profile | null, draft: Draft, bodyweightKg: number) {
  const day = today();
  if (draft.sex !== null && draft.sex !== valueInForce(current?.sex ?? [], day)) await training.setProfile('sex', draft.sex);
  if (bodyweightKg !== valueInForce(current?.bodyweightKg ?? [], day)) await training.setProfile('bodyweightKg', bodyweightKg);
  if (draft.target !== valueInForce(current?.weeklyTarget ?? [], day)) await training.setProfile('weeklyTarget', draft.target);
}

// Asked once, after the email is verified: the units, then the three dated histories.
export function Onboarding({ userId, training, onDone }: { userId: string; training: Training; onDone: () => void }) {
  const { t } = useI18n();
  const b = t.body;
  const [units, setChosen] = useState<Units>('kg');
  const [draft, setDraft] = useState<Draft>({ sex: null, bodyweight: '', target: 3 });
  const [busy, setBusy] = useState(false);
  const bodyweightKg = typedBodyweightKg(draft.bodyweight, units);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.sex === null || bodyweightKg === null || busy) return;
    setBusy(true);
    setUnits(userId, units);
    await saveBody(training, null, draft, bodyweightKg);
    onDone();
  }

  return (
    <main className="screen">
      <h1 className="disp title">{b.onboardingTitle}</h1>
      <form className="card form" onSubmit={submit}>
        <p className="muted">{b.onboardingText}</p>
        <UnitsChoice value={units} onChange={setChosen} />
        <BodyFields units={units} draft={draft} onChange={setDraft} />
        <p className="muted">
          {b.privacy} <Info term="strengthLevel" />
        </p>
        <button className="btn-primary" disabled={draft.sex === null || bodyweightKg === null || busy}>
          {b.continue}
        </button>
      </form>
    </main>
  );
}

// The Profile tab: units and language apply at once; the rest is saved together.
export function ProfileSettings({
  userId,
  training,
  profile,
  units,
  onSaved,
}: {
  userId: string;
  training: Training;
  profile: Profile;
  units: Units;
  onSaved: () => void;
}) {
  const { t, language } = useI18n();
  const b = t.body;
  const layout = useLayout(userId);
  const day = today();
  const inForce = {
    sex: valueInForce(profile.sex, day) ?? null,
    bodyweightKg: valueInForce(profile.bodyweightKg, day),
    weeklyTarget: valueInForce(profile.weeklyTarget, day),
  };
  const [draft, setDraft] = useState<Draft | null>(null);
  const shown: Draft = draft ?? {
    sex: inForce.sex,
    bodyweight: inForce.bodyweightKg === undefined ? '' : String(Math.round(kgToUnits(inForce.bodyweightKg, units) * 10) / 10),
    target: inForce.weeklyTarget ?? 3,
  };
  const bodyweightKg = typedBodyweightKg(shown.bodyweight, units);
  // A Weekly Target already changed, waiting for its Monday.
  const upcoming = profile.weeklyTarget.find(({ effectiveFrom }) => effectiveFrom > day);

  return (
    <form
      className="card form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!draft || bodyweightKg === null) return;
        await saveBody(training, profile, draft, bodyweightKg);
        setDraft(null);
        onSaved();
      }}
    >
      <UnitsChoice value={units} onChange={(next) => setUnits(userId, next)} />
      <Choice<Language>
        label={b.language}
        options={[
          { value: 'en', text: 'English' },
          { value: 'es', text: 'Español' },
        ]}
        value={language}
        onChange={setLanguage}
      />
      <Choice<Layout>
        label={b.layout}
        options={[
          { value: 'list', text: b.layoutList },
          { value: 'focus', text: b.layoutFocus },
        ]}
        value={layout}
        onChange={(next) => setLayout(userId, next)}
      />
      <BodyFields units={units} draft={shown} onChange={setDraft} />
      {upcoming && (
        <p className="muted">
          {b.startsOn(
            upcoming.value,
            new Intl.DateTimeFormat(language === 'es' ? 'es-AR' : 'en-US', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone: 'UTC',
            }).format(new Date(`${upcoming.effectiveFrom}T00:00:00Z`)),
          )}
        </p>
      )}
      {draft && bodyweightKg === null && <p className="error">{b.invalid}</p>}
      <p className="muted">
        {b.privacy} <Info term="strengthLevel" />
      </p>
      <button className="btn-primary" disabled={!draft || bodyweightKg === null || shown.sex === null}>
        {b.save}
      </button>
    </form>
  );
}

// What Group members may see of the user, one choice for every Group. Saved online and at once.
export function VisibilityCard({ userId }: { userId: string }) {
  const { t } = useI18n();
  const g = t.groups;
  const saved = useVisibility(userId);
  const [error, setError] = useState(false);
  useEffect(() => {
    refreshVisibility(userId).catch(() => {});
  }, [userId]);
  const visibility = saved ?? { share_weights: false, share_sessions: false };
  const toggle = (field: keyof Visibility) => {
    setError(false);
    saveVisibility(userId, { ...visibility, [field]: !visibility[field] }).catch(() => setError(true));
  };
  return (
    <section className="card">
      <div className="eyebrow">{g.visibilityTitle}</div>
      <p className="muted">{g.visibilityText}</p>
      <div className="choices">
        <button type="button" className="chip" aria-pressed={visibility.share_weights} onClick={() => toggle('share_weights')}>
          {g.shareWeights}
        </button>
        <button type="button" className="chip" aria-pressed={visibility.share_sessions} onClick={() => toggle('share_sessions')}>
          {g.shareSessions}
        </button>
      </div>
      {error && <p className="error">{g.retry}</p>}
    </section>
  );
}

// Every two weeks Home asks whether bodyweight has changed. Dismissing keeps the last value.
export function BodyweightPrompt({
  training,
  profile,
  units,
  onDone,
}: {
  training: Training;
  profile: Profile;
  units: Units;
  onDone: () => void;
}) {
  const { t, formatNumber } = useI18n();
  const b = t.body;
  const last = profile.bodyweightKg.at(-1)!.value;
  const [text, setText] = useState('');
  const bodyweightKg = typedBodyweightKg(text, units);

  return (
    <form
      className="card form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (bodyweightKg === null) return;
        await training.setProfile('bodyweightKg', bodyweightKg);
        onDone();
      }}
    >
      <div className="eyebrow">{b.promptTitle}</div>
      <p className="muted">{b.promptText(`${formatNumber(kgToUnits(last, units))} ${units}`)}</p>
      <Field
        label={b.bodyweight(units)}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(event) => setText(event.target.value.replace(/[^\d.,]/g, ''))}
      />
      <button className="btn-primary" disabled={bodyweightKg === null}>
        {b.save}
      </button>
      <button
        type="button"
        className="btn-ghost"
        onClick={async () => {
          await training.dismissBodyweightPrompt();
          onDone();
        }}
      >
        {b.dismiss}
      </button>
    </form>
  );
}
