import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.tsx';
import { createI18n, detectLanguage, I18nContext } from './i18n.ts';
import './styles.css';

const i18n = createI18n(detectLanguage(navigator.languages));
document.documentElement.lang = i18n.language;

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
    <I18nContext value={i18n}>
      <App />
    </I18nContext>
  </StrictMode>,
);
