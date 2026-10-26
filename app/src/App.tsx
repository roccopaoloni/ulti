import { useState } from 'react';
import { signOut, useUser } from './auth.ts';
import { AuthScreens, useAuthFlow } from './AuthScreens.tsx';
import { useI18n, type Term } from './i18n.ts';
import { tabIcons } from './icons.tsx';
import { Info } from './Info.tsx';
import { navigate, paths, tabs, useCurrentTab, type Tab } from './navigation.ts';

// The glossary term each empty screen introduces.
const screenTerms: Record<Tab, Term> = {
  home: 'weeklyTarget',
  train: 'routine',
  groups: 'group',
  profile: 'rank',
};

// Signing in is required to reach the tabs. A password reset's code signs the user in before the
// new password is saved, so the reset screen stays until it is.
export function App() {
  const user = useUser();
  const [flow, setFlow] = useAuthFlow();

  if (!user || flow.screen === 'reset') {
    return <AuthScreens flow={flow} setFlow={setFlow} signedIn={user !== null} />;
  }
  return <Tabs />;
}

function Tabs() {
  const { t } = useI18n();
  const current = useCurrentTab();
  const { label, text } = t.screens[current];
  const [signOutError, setSignOutError] = useState<string>();

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
        <section className="card">
          <div className="eyebrow">
            {label} <Info term={screenTerms[current]} />
          </div>
          <p className="muted">{text}</p>
        </section>
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
