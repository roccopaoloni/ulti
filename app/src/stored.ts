import { useMemo, useSyncExternalStore } from 'react';

// Small values kept in localStorage, so they survive a reload into a new version (main.tsx).
// Every component reading a key re-renders when it's written.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function write<T>(key: string, value: T | null) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
  listeners.forEach((listener) => listener());
}

export function useStored<T>(key: string): T | null {
  const stored = useSyncExternalStore(subscribe, () => localStorage.getItem(key));
  return useMemo(() => (stored === null ? null : (JSON.parse(stored) as T)), [stored]);
}
