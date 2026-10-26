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

export function useCurrentTab(): Tab {
  const pathname = useSyncExternalStore(subscribe, () => location.pathname);
  return tabs.find((tab) => paths[tab] === pathname) ?? 'home';
}

export function navigate(path: string) {
  history.pushState(null, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}
