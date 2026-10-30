import { useI18n } from './i18n.ts';
import { shareIcon } from './icons.tsx';
import { promptInstall, useInstallHelp, type InstallHelp } from './install.ts';
import { useStored, write } from './stored.ts';

const dismissedKey = 'ulti-install-dismissed';

// How to install on this phone: the browser's Install button, the iPhone Share steps, or a hint.
function InstallSteps({ help }: { help: Exclude<InstallHelp, 'installed'> }) {
  const { t } = useI18n();
  if (help === 'prompt') {
    return (
      <button type="button" className="btn-primary" onClick={promptInstall}>
        {t.install.install}
      </button>
    );
  }
  if (help === 'ios') {
    return (
      <ol className="install-steps">
        <li>
          {shareIcon} {t.install.iosShare}
        </li>
        <li>{t.install.iosAdd}</li>
      </ol>
    );
  }
  return <p className="muted">{t.install.other}</p>;
}

// On Home until the app is installed or the card is dismissed on this phone.
export function InstallCard() {
  const { t } = useI18n();
  const help = useInstallHelp();
  const dismissed = useStored<boolean>(dismissedKey);
  if (help === 'installed' || dismissed) return null;
  return (
    <section className="card">
      <div className="eyebrow">{t.install.title}</div>
      <p className="muted">{t.install.homeText}</p>
      <InstallSteps help={help} />
      <button type="button" className="btn-ghost" onClick={() => write(dismissedKey, true)}>
        {t.install.notNow}
      </button>
    </section>
  );
}

// The permanent entry in Settings, hidden once the app is installed.
export function InstallSettings() {
  const { t } = useI18n();
  const help = useInstallHelp();
  if (help === 'installed') return null;
  return (
    <section className="card">
      <div className="eyebrow">{t.install.settingsTitle}</div>
      <InstallSteps help={help} />
    </section>
  );
}
