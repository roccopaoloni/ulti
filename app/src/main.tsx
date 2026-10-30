import { StrictMode, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.tsx';
import { BadgeDefs } from './Badge.tsx';
import { captureInvite } from './groups.ts';
import { captureInstallPrompt } from './install.ts';
import { createI18n, detectLanguage, I18nContext, type Language } from './i18n.ts';
import { languageKey } from './profile.ts';
import { useStored } from './stored.ts';
import './styles.css';

captureInvite();
captureInstallPrompt();

// The language the user picked in Profile, else the phone's.
function Root() {
  const picked = useStored<Language>(languageKey);
  const i18n = useMemo(() => createI18n(picked ?? detectLanguage(navigator.languages)), [picked]);
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n]);
  return (
    <I18nContext value={i18n}>
      <BadgeDefs />
      <App />
    </I18nContext>
  );
}

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    // Browsers look for a new version when the app is opened from scratch. An installed app
    // often comes back from the background instead, so look again whenever it's shown.
    document.addEventListener('visibilitychange', () => {
      // Offline, the check fails; the next one will catch the update.
      if (document.visibilityState === 'visible') registration?.update().catch(() => {});
    });
  },
});

// On a fresh open the browser may install the new version before registerSW is listening, which
// leaves the old version on screen. So when a new version takes over this page, reload into it.
if (navigator.serviceWorker?.controller) {
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
