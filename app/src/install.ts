import { useSyncExternalStore } from 'react';

// Which install help a phone sees: nothing once the app is installed, the browser's Install button
// when it offers one, the Share steps on an iPhone, and a generic hint anywhere else.
export type InstallHelp = 'installed' | 'prompt' | 'ios' | 'other';

export function installHelp({ standalone, ios, prompt }: { standalone: boolean; ios: boolean; prompt: boolean }): InstallHelp {
  if (standalone) return 'installed';
  if (prompt) return 'prompt';
  return ios ? 'ios' : 'other';
}

// Android Chrome (and desktop Chromium) offer their install prompt once, early, and only to
// call from a click. It's kept here until the Install button uses it.
type InstallPromptEvent = Event & { prompt: () => Promise<void> };

let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function notify() {
  listeners.forEach((listener) => listener());
}

// Called at startup (main.tsx), so the prompt is captured before the first render.
export function captureInstallPrompt() {
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notify();
  });
  addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
}

// The browser's own dialog. A prompt can only be used once, so it's dropped as soon as it's shown.
export async function promptInstall() {
  const event = deferredPrompt;
  if (!event) return;
  deferredPrompt = null;
  notify();
  await event.prompt();
}

// Opened from the home screen (or the iOS shortcut), the app runs without the browser's chrome.
function isStandalone() {
  return installed || matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function useInstallHelp(): InstallHelp {
  return useSyncExternalStore(subscribe, () =>
    installHelp({
      standalone: isStandalone(),
      ios: /iPhone|iPad|iPod/.test(navigator.userAgent),
      prompt: deferredPrompt !== null,
    }),
  );
}
