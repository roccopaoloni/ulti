import { useState, type FormEvent } from 'react';
import type { Units } from '@ulti/rules';
import { signOut } from './auth.ts';
import { DeleteAccount, errorText, useNameForm } from './GroupsScreens.tsx';
import { GroupsError } from './groups.ts';
import { InstallSettings } from './InstallApp.tsx';
import { useI18n } from './i18n.ts';
import { paths } from './navigation.ts';
import { AppSettings, useBodyForm, VisibilityCard } from './ProfileScreens.tsx';
import { SubScreen } from './SubScreen.tsx';
import type { Profile, Training } from './training.ts';

// Settings, You: the name and colour friends see, then sex, bodyweight and Weekly Target, with one
// Save for whatever changed. The name goes straight to the server and needs a connection; the rest
// is saved on the phone either way, so when the name can't be saved it says so after saving the rest.
function YouSettings({ userId, training, profile, units, onSaved }: { userId: string; training: Training; profile: Profile; units: Units; onSaved: () => void }) {
  const { t } = useI18n();
  const name = useNameForm(userId);
  const body = useBodyForm(training, profile, units, onSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const changed = name.changed || body.changed;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setSaved(false);
    await body.save();
    try {
      await name.save();
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof GroupsError && caught.reason === 'offline' ? t.settings.nameOffline : errorText(caught, t));
    }
    setBusy(false);
  }

  return (
    <form className="card form" onSubmit={submit}>
      <div className="eyebrow">{t.groups.profileTitle}</div>
      {name.fields}
      {body.fields}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="muted" role="status">
          {t.groups.saved}
        </p>
      )}
      <button className="btn-primary" disabled={busy || !changed || !body.valid}>
        {t.groups.save}
      </button>
    </form>
  );
}

// Everything editable about the user, opened from the ⚙ on Profile.
export function SettingsScreen({
  userId,
  training,
  profile,
  units,
  onSaved,
}: {
  userId: string;
  training: Training | null;
  profile: Profile | null;
  units: Units;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [signOutError, setSignOutError] = useState<string>();
  return (
    <SubScreen title={t.settings.title} parent={paths.profile}>
      <h2 className="section-title">{t.settings.you}</h2>
      {training && profile && <YouSettings userId={userId} training={training} profile={profile} units={units} onSaved={onSaved} />}
      <h2 className="section-title">{t.settings.app}</h2>
      <AppSettings userId={userId} units={units} />
      <InstallSettings />
      <h2 className="section-title">{t.settings.privacy}</h2>
      <VisibilityCard userId={userId} />
      <h2 className="section-title">{t.settings.account}</h2>
      <button
        type="button"
        className="btn-link"
        onClick={async () => {
          // Signing out fails and leaves the user signed in only offline with an expired
          // token. Otherwise they're signed out and the tabs are gone.
          if (await signOut()) setSignOutError(t.auth.errors.offline);
        }}
      >
        {t.auth.signOut}
      </button>
      {signOutError && (
        <p className="error" role="alert">
          {signOutError}
        </p>
      )}
      <DeleteAccount training={training} />
      <h2 className="section-title">{t.about.title}</h2>
      <section className="card about">
        <a href="https://fitnessvolt.com/strength-standards/strength-data/" target="_blank" rel="noreferrer">
          {t.about.fitnessVoltLink}
        </a>
        <p className="muted">{t.about.symmetricStrength}</p>
      </section>
    </SubScreen>
  );
}
