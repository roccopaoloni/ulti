import { createClient } from '@supabase/supabase-js';
import { useMemo, useSyncExternalStore } from 'react';

// supabase-js keeps the session (the access and refresh tokens, and the user) in localStorage under
// this key. The user is signed in for as long as it's stored: supabase-js removes it when they sign
// out, or when the server rejects the refresh token, but never because a refresh failed offline.
// getSession() and onAuthStateChange report no session while an expired token can't refresh, so
// they can't be what decides whether someone is signed in.
const sessionKey = 'ulti-session';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storageKey: sessionKey,
      storage: {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => {
          localStorage.setItem(key, value);
          notify();
        },
        removeItem: (key) => {
          localStorage.removeItem(key);
          notify();
        },
      },
    },
  },
);

export type User = { id: string; email: string };

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

// The signed-in user, known offline too; null when nobody is signed in on this device.
export function useUser(): User | null {
  const stored = useSyncExternalStore(subscribe, () => localStorage.getItem(sessionKey));
  return useMemo(() => {
    if (!stored) return null;
    const { user } = JSON.parse(stored) as { user: User };
    return { id: user.id, email: user.email };
  }, [stored]);
}

// Signs out on this device only. Offline it still signs out, unless the access token has expired:
// then supabase-js keeps the session and returns the network error.
export async function signOut() {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  return error;
}
