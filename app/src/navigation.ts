import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

export const tabs = ['home', 'train', 'groups', 'profile'] as const;
export type Tab = (typeof tabs)[number];

export const paths: Record<Tab, string> = {
  home: '/',
  train: '/train',
  groups: '/groups',
  profile: '/profile',
};

const listeners = new Set<() => void>();

// A screen change fades and rises where the browser has View Transitions, and is instant where it
// doesn't or where the user asked for reduced motion. `flushSync` makes React render the new screen
// inside the transition, so the browser snapshots it.
function changeScreen() {
  const run = () => listeners.forEach((listener) => listener());
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return run();
  document.startViewTransition(() => flushSync(run));
}
if (typeof addEventListener === 'function') addEventListener('popstate', changeScreen);

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => void listeners.delete(onChange);
}

export function usePathname() {
  return useSyncExternalStore(subscribe, () => location.pathname);
}

// Screens that open on top of a tab (see SubScreen.tsx) live under that tab's path, so the tab
// stays the current one. Reloading on their URL reopens them.
export const settingsPath = `${paths.profile}/settings`;
export const routinePath = `${paths.train}/routine`;

export const historyPath = `${paths.train}/history`;
export const sessionPath = (id: string) => `${historyPath}/${id}`;
// The Session whose detail screen the path is, if any.
export const sessionFromPath = (pathname: string) =>
  pathname.startsWith(`${historyPath}/`) ? pathname.slice(historyPath.length + 1) : null;

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
