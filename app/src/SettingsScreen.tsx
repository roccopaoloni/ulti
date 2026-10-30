import { useState } from 'react';
import type { Units } from '@ulti/rules';
import { signOut } from './auth.ts';
import { DeleteAccount, ProfileCard } from './GroupsScreens.tsx';
import { useI18n } from './i18n.ts';
import { paths } from './navigation.ts';
import { AppSettings, BodySettings, VisibilityCard } from './ProfileScreens.tsx';
import { SubScreen } from './SubScreen.tsx';
import type { Profile, Training } from './training.ts';

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
      <ProfileCard userId={userId} />
      {training && profile && <BodySettings training={training} profile={profile} units={units} onSaved={onSaved} />}
      <h2 className="section-title">{t.settings.app}</h2>
      <AppSettings userId={userId} units={units} />
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
