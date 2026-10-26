import { useState } from 'react';
import { signOut, useUser } from './auth.ts';
import { AuthScreens, useAuthFlow } from './AuthScreens.tsx';
import { newGroupPath, usePendingInvite } from './groups.ts';
import { CreateGroup, GroupsTab, JoinInvite, ProfileCard } from './GroupsScreens.tsx';
import { useI18n, type Term } from './i18n.ts';
import { tabIcons } from './icons.tsx';
import { Info } from './Info.tsx';
import { navigate, paths, tabs, useCurrentTab, usePathname, type Tab } from './navigation.ts';
import { SessionScreen, StartSession, useLogging } from './SessionScreen.tsx';
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

  if (training && logging.open) return <SessionScreen training={training} onLeave={logging.leave} />;
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
          <GroupsTab userId={userId} />
        ) : (
          <section className="card">
            <div className="eyebrow">
              {label} <Info term={screenTerms[current]} />
            </div>
            <p className="muted">{text}</p>
          </section>
        )}
        {current === 'home' && training && <StartSession logging={logging} />}
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
          </>
        )}
      </main>
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
