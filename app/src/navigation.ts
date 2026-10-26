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

export function useCurrentTab(): Tab {
  const pathname = usePathname();
  return tabs.find((tab) => paths[tab] === pathname) ?? 'home';
}

// `replace` swaps the current history entry, so Back doesn't return to a screen that's done.
export function navigate(path: string, replace = false) {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}
