import { useEffect, useState } from 'react';
import { signOut, useUser } from './auth.ts';
import { AuthScreens, useAuthFlow } from './AuthScreens.tsx';
import { FriendsTrainedToday, RaceCards, SinceLastVisit } from './Boards.tsx';
import { newGroupPath, usePendingInvite } from './groups.ts';
import { CreateGroup, GroupsTab, JoinInvite, ProfileCard } from './GroupsScreens.tsx';
import { StampsCard, WeekCard } from './Consistency.tsx';
import { History } from './HistoryScreen.tsx';
import { useI18n, type Term } from './i18n.ts';
import { tabIcons } from './icons.tsx';
import { Info } from './Info.tsx';
import { navigate, paths, tabs, useCurrentTab, usePathname, type Tab } from './navigation.ts';
import { hasEverything, useBodyProfile, useUnits } from './profile.ts';
import { RankCard } from './RankCard.tsx';
import { BodyweightPrompt, Onboarding, ProfileSettings } from './ProfileScreens.tsx';
import { RoutineEditor } from './RoutineScreen.tsx';
import { SessionInProgressBar, SessionScreen, StartSession, useLogging } from './SessionScreen.tsx';
import { useTraining } from './useTraining.ts';

// The glossary term each empty screen introduces.
const screenTerms: Record<Tab, Term> = {
  home: 'weeklyTarget',
  train: 'routine',
  groups: 'group',
  profile: 'rank',
};

// Signing in is required to reach the tabs. A password reset's code signs the user in before the
// new password is saved, so the reset screen stays until it is. An invite link kept from before
// signing in is applied as soon as someone is.
export function App() {
  const user = useUser();
  const [flow, setFlow] = useAuthFlow();
  const invite = usePendingInvite();
  const pathname = usePathname();

  if (!user || flow.screen === 'reset') {
    return <AuthScreens flow={flow} setFlow={setFlow} signedIn={user !== null} />;
  }
  if (invite) return <JoinInvite key={invite} userId={user.id} code={invite} />;
  if (pathname === newGroupPath) return <CreateGroup userId={user.id} />;
  return <Tabs userId={user.id} />;
}

function Tabs({ userId }: { userId: string }) {
  const { t } = useI18n();
  const current = useCurrentTab();
  const { label, text } = t.screens[current];
  const [signOutError, setSignOutError] = useState<string>();
  const training = useTraining(userId);
  const logging = useLogging(training);
  const { profile, ready, reload } = useBodyProfile(userId, training);
  const storedUnits = useUnits(userId);
  const units = storedUnits ?? 'kg';
  const [promptDue, setPromptDue] = useState(false);

  useEffect(() => {
    training?.bodyweightPromptDue().then(setPromptDue);
  }, [training, profile]);

  // Until the user has given their units, sex, bodyweight and Weekly Target, nothing else opens.
  if (training && ready && !hasEverything(profile, storedUnits)) {
    return <Onboarding userId={userId} training={training} onDone={reload} />;
  }
  if (training && logging.open) return <SessionScreen training={training} units={units} onLeave={logging.leave} />;
  return (
    <>
      <main className="screen">
        {current === 'home' ? (
          <header className="home-head">
            <h1 className="wordmark">ULTI</h1>
            <span className="tagline">{t.tagline}</span>
          </header>
        ) : (
          <h1 className="disp title">{t.tabs[current]}</h1>
        )}
        {current === 'profile' && <ProfileCard userId={userId} />}
        {current === 'groups' ? (
          <GroupsTab userId={userId} training={training} />
        ) : (
          <section className="card">
            <div className="eyebrow">
              {label} <Info term={screenTerms[current]} />
            </div>
            <p className="muted">{text}</p>
          </section>
        )}
        {current === 'home' && training && profile && promptDue && (
          <BodyweightPrompt
            training={training}
            profile={profile}
            units={units}
            onDone={async () => {
              await reload();
              setPromptDue(await training.bodyweightPromptDue());
            }}
          />
        )}
        {current === 'home' && <SinceLastVisit userId={userId} />}
        {current === 'home' && training && profile && <WeekCard training={training} profile={profile} />}
        {current === 'home' && training && <StartSession logging={logging} training={training} />}
        {current === 'home' && <RaceCards userId={userId} />}
        {current === 'home' && <FriendsTrainedToday userId={userId} />}
        {current === 'train' && training && <RoutineEditor training={training} profile={profile} onProfileSaved={reload} />}
        {current === 'train' && training && <History training={training} units={units} />}
        {current === 'profile' && training && <RankCard training={training} />}
        {current === 'profile' && training && <StampsCard training={training} />}
        {current === 'profile' && training && profile && (
          <ProfileSettings userId={userId} training={training} profile={profile} units={units} onSaved={reload} />
        )}
        {current === 'profile' && (
          <>
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
            <section aria-label={t.about.title}>
              <h2 className="disp">{t.about.title}</h2>
              <p>
                <a href="https://fitnessvolt.com/strength-standards/strength-data/" target="_blank" rel="noreferrer">
                  {t.about.fitnessVoltLink}
                </a>
              </p>
              <p>{t.about.symmetricStrength}</p>
            </section>
          </>
        )}
      </main>
      <SessionInProgressBar logging={logging} />
      <nav className="tabbar">
        {tabs.map((tab) => (
          <a
            key={tab}
            href={paths[tab]}
            className="tab"
            aria-current={tab === current ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault();
              navigate(paths[tab]);
            }}
          >
            {tabIcons[tab]}
            <span>{t.tabs[tab]}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
