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

export function App() {
  const { t } = useI18n();
  const current = useCurrentTab();
  const { label, text } = t.screens[current];

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
