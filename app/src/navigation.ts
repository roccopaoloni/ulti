import { useSyncExternalStore } from 'react';

export const tabs = ['home', 'train', 'groups', 'profile'] as const;
export type Tab = (typeof tabs)[number];

export const paths: Record<Tab, string> = {
  home: '/',
  train: '/train',
  groups: '/groups',
  profile: '/profile',
};

function subscribe(onChange: () => void) {
  addEventListener('popstate', onChange);
  return () => removeEventListener('popstate', onChange);
}

export function usePathname() {
  return useSyncExternalStore(subscribe, () => location.pathname);
}

// Screens that open on top of a tab (see SubScreen.tsx) live under that tab's path, so the tab
// stays the current one. Reloading on their URL reopens them.
export const settingsPath = `${paths.profile}/settings`;

export function useCurrentTab(): Tab {
  const pathname = usePathname();
  return tabs.find((tab) => paths[tab] === pathname || (tab !== 'home' && pathname.startsWith(`${paths[tab]}/`))) ?? 'home';
}

// Entries pushed here carry `app`, so a screen can tell whether Back stays inside the app.
// `replace` swaps the current history entry, so Back doesn't return to a screen that's done.
export function navigate(path: string, replace = false) {
  if (replace) history.replaceState(null, '', path);
  else history.pushState({ app: true }, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}

// Back to where the user came from, or to `fallback` when this screen was opened directly.
export function goBack(fallback: string) {
  if (history.state?.app) history.back();
  else navigate(fallback, true);
}
