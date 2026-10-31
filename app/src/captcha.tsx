import { useCallback, useEffect, useRef } from 'react';
import { useI18n } from './i18n.ts';

// Cloudflare Turnstile, the captcha Supabase checks on sign-up, sign-in and password reset
// (docs/setup.md, step 15). Its script is loaded from Cloudflare when first needed rather than
// added as a dependency. With no site key (the local stack, CI) there is no widget and no token.
const siteKey: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY || undefined;

type Turnstile = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

export class CaptchaError extends Error {}

let script: Promise<Turnstile> | undefined;
function loadTurnstile() {
  script ??= new Promise<Turnstile>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    tag.async = true;
    tag.onload = () => resolve(window.turnstile!);
    tag.onerror = () => {
      tag.remove();
      script = undefined; // so the next try loads it again
      reject(new CaptchaError('Turnstile did not load'));
    };
    document.head.append(tag);
  });
  return script;
}

type State = { id?: string; token?: string; failed?: boolean; mount?: () => void; waiting: Array<() => void> };

// The widget, and `take`: it resolves with a fresh token (undefined when there's no site key) and
// starts a new challenge, because a token works once. A failed challenge rejects with a
// CaptchaError and is restarted, so the next submit is a retry.
export function useCaptcha() {
  const { language } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<State>({ waiting: [] });

  useEffect(() => {
    if (!siteKey || !container.current) return;
    const state = widget.current;
    const settle = () => state.waiting.splice(0).forEach((wake) => wake());
    let removed = false;
    state.mount = () =>
      loadTurnstile()
        .then((turnstile) => {
          if (removed || !container.current) return;
          state.id = turnstile.render(container.current, {
            sitekey: siteKey,
            theme: 'auto', // follows the phone's dark or light, like the rest of the app
            appearance: 'interaction-only', // hidden unless Cloudflare needs a tap
            size: 'flexible', // fills the container, so it lines up with the fields
            language,
            callback: (token: string) => {
              state.token = token;
              state.failed = false;
              settle();
            },
            'expired-callback': () => (state.token = undefined),
            'error-callback': () => {
              state.token = undefined;
              state.failed = true;
              settle();
              return true; // handled: Turnstile logs nothing more
            },
          });
        })
        .catch(() => {
          state.failed = true;
          settle();
        });
    state.mount();
    return () => {
      removed = true;
      if (state.id) window.turnstile?.remove(state.id);
      state.id = state.token = state.mount = undefined;
    };
  }, [language]);

  const take = useCallback(async () => {
    if (!siteKey) return undefined;
    const state = widget.current;
    // The script never loaded: load it again for this try.
    if (!state.id && state.failed) {
      state.failed = false;
      state.mount?.();
    }
    if (!state.token && !state.failed) await new Promise<void>((wake) => state.waiting.push(wake));
    const token = state.token;
    state.token = undefined;
    if (state.id) {
      state.failed = false;
      window.turnstile?.reset(state.id);
    }
    if (!token) throw new CaptchaError('Captcha failed');
    return token;
  }, []);

  return { take, widget: siteKey ? <div ref={container} className="captcha" /> : null };
}
