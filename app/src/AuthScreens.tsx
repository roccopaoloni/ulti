import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { useId, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { supabase } from './auth.ts';
import { CaptchaError, useCaptcha } from './captcha.tsx';
import { usePendingInvite } from './groups.ts';
import { useI18n, type I18n } from './i18n.ts';
import { backIcon } from './icons.tsx';
import { Info } from './Info.tsx';

type Screen = 'welcome' | 'signUp' | 'verify' | 'signIn' | 'forgot' | 'reset';

// Where the user is in signing up or in, and the email they typed. It's kept in localStorage, so
// coming back from the mail app, or a reload into a new version, lands on the same screen.
export type Flow = { screen: Screen; email: string };

const flowKey = 'ulti-auth-flow';
const start: Flow = { screen: 'welcome', email: '' };

export function useAuthFlow() {
  const [flow, setFlowState] = useState<Flow>(() => JSON.parse(localStorage.getItem(flowKey) ?? 'null') ?? start);
  const setFlow = (next: Flow) => {
    localStorage.setItem(flowKey, JSON.stringify(next));
    setFlowState(next);
  };
  return [flow, setFlow] as const;
}

const backTo: Partial<Record<Screen, Screen>> = {
  signUp: 'welcome',
  verify: 'signUp',
  signIn: 'welcome',
  forgot: 'signIn',
  reset: 'forgot',
};

function errorMessage(error: unknown, t: I18n['t']) {
  const { errors, passwordHint } = t.auth;
  if (error instanceof CaptchaError) return errors.captcha;
  if (isAuthRetryableFetchError(error)) return errors.offline;
  if (!isAuthError(error)) return errors.other;
  switch (error.code) {
    case 'invalid_credentials':
      return errors.wrongPassword;
    case 'otp_expired':
      return errors.wrongCode;
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return errors.tooMany;
    case 'same_password':
      return errors.samePassword;
    case 'captcha_failed':
      return errors.captcha;
    case 'weak_password':
      return passwordHint;
    default:
      return errors.other;
  }
}

// Sign-up, email verification, sign-in and password reset. Every code is typed in here; no email
// carries a link, because a link would open the browser instead of the installed app.
// `signedIn` is true on the reset screen once its code has been verified: the code signs the user
// in, and the new password is saved after.
export function AuthScreens({ flow, setFlow, signedIn }: { flow: Flow; setFlow: (flow: Flow) => void; signedIn: boolean }) {
  const { t, language } = useI18n();
  const a = t.auth;
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const invited = usePendingInvite() !== null;
  const email = flow.email.trim();
  const captcha = useCaptcha();

  const go = (screen: Screen) => {
    setFlow({ ...flow, screen });
    setPassword('');
    setCode('');
    setError(undefined);
    setNotice(undefined);
  };
  // Signed in: the tabs take over.
  const done = () => setFlow(start);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await task();
    } catch (caught) {
      setError(errorMessage(caught, t));
    } finally {
      setBusy(false);
    }
  }

  const resend = () =>
    run(async () => {
      const captchaToken = await captcha.take();
      const { error } =
        flow.screen === 'verify'
          ? await supabase.auth.resend({ type: 'signup', email, options: { captchaToken } })
          : await supabase.auth.resetPasswordForEmail(email, { captchaToken });
      if (error) throw error;
      setNotice(a.resent);
    });

  const emailField = (
    <Field
      label={a.email}
      type="email"
      inputMode="email"
      autoComplete="email"
      required
      value={flow.email}
      onChange={(event) => setFlow({ ...flow, email: event.target.value })}
    />
  );
  const newPasswordField = (label: string) => (
    <Field
      label={label}
      hint={a.passwordHint}
      type="password"
      autoComplete="new-password"
      minLength={8}
      required
      value={password}
      onChange={(event) => setPassword(event.target.value)}
    />
  );
  const codeField = (
    <Field
      label={a.code}
      className="code-input"
      inputMode="numeric"
      autoComplete="one-time-code"
      minLength={6}
      maxLength={6}
      required
      value={code}
      onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
    />
  );
  const codeSent = (
    <p className="lead">
      {a.codeSentTo} <b>{email}</b>.
    </p>
  );
  const resendButton = (
    <button type="button" className="btn-link inline" onClick={resend} disabled={busy}>
      {a.resend}
    </button>
  );

  let body: ReactNode;
  let primary: string;
  let submit: () => Promise<void>;
  let secondary: ReactNode = null;

  switch (flow.screen) {
    case 'welcome':
      body = (
        <>
          <img className="welcome-mark" src="/icon.svg" alt="" />
          <div>
            <h1 className="wordmark welcome-wordmark">ULTI</h1>
            <p className="tagline welcome-tagline">{t.tagline}</p>
          </div>
          <p className="lead">{a.pitch}</p>
          {invited && (
            <section className="card">
              <div className="eyebrow">
                {t.groups.invited} <Info term="group" />
              </div>
              <p>{t.groups.invitedText}</p>
            </section>
          )}
        </>
      );
      primary = a.createAccount;
      submit = async () => go('signUp');
      secondary = (
        <button type="button" className="btn-link" onClick={() => go('signIn')}>
          {a.haveAccount}
        </button>
      );
      break;

    case 'signUp':
      body = (
        <>
          <h1 className="disp auth-h">{a.signUpTitle}</h1>
          {emailField}
          {newPasswordField(a.password)}
        </>
      );
      primary = a.createAccount;
      submit = async () => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { language }, captchaToken: await captcha.take() },
        });
        if (error) throw error;
        // An email that already has a verified account gets no code: Supabase answers as if it
        // signed up, but with no identities.
        if (data.user?.identities?.length === 0) return setError(a.errors.alreadyRegistered);
        go('verify');
      };
      secondary = (
        <button type="button" className="btn-link" onClick={() => go('signIn')}>
          {a.haveAccount}
        </button>
      );
      break;

    case 'verify':
      body = (
        <>
          <h1 className="disp auth-h">{a.checkEmailTitle}</h1>
          {codeSent}
          {codeField}
          {resendButton}
        </>
      );
      primary = a.verify;
      submit = async () => {
        const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
        if (error) throw error;
        done();
      };
      break;

    case 'signIn':
      body = (
        <>
          <h1 className="disp auth-h">{a.signInTitle}</h1>
          {emailField}
          <Field
            label={a.password}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="button" className="btn-link inline" onClick={() => go('forgot')}>
            {a.forgot}
          </button>
        </>
      );
      primary = a.signIn;
      submit = async () => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken: await captcha.take() },
        });
        // Signed up but never verified: send a fresh code and ask for it.
        if (error?.code === 'email_not_confirmed') {
          await supabase.auth.resend({ type: 'signup', email, options: { captchaToken: await captcha.take() } });
          return go('verify');
        }
        if (error) throw error;
        done();
      };
      break;

    case 'forgot':
      body = (
        <>
          <h1 className="disp auth-h">{a.forgotTitle}</h1>
          <p className="lead">{a.forgotText}</p>
          {emailField}
        </>
      );
      primary = a.sendCode;
      submit = async () => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { captchaToken: await captcha.take() });
        if (error) throw error;
        go('reset');
      };
      break;

    case 'reset':
      body = (
        <>
          <h1 className="disp auth-h">{signedIn ? a.newPassword : a.checkEmailTitle}</h1>
          {!signedIn && codeSent}
          {!signedIn && codeField}
          {newPasswordField(a.newPassword)}
          {!signedIn && resendButton}
        </>
      );
      primary = a.saveAndSignIn;
      submit = async () => {
        if (!signedIn) {
          const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
          if (error) throw error;
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        done();
      };
      break;
  }

  const back = backTo[flow.screen];

  return (
    <form
      className="auth"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        run(submit);
      }}
    >
      <main className="screen auth-body">
        {back && (
          <button type="button" className="iconbtn back" aria-label={a.back} onClick={() => go(back)}>
            {backIcon}
          </button>
        )}
        {body}
        {captcha.widget}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="muted" role="status">
            {notice}
          </p>
        )}
      </main>
      <div className="auth-foot">
        <button className="btn-primary" disabled={busy}>
          {primary}
        </button>
        {secondary}
      </div>
    </form>
  );
}

export function Field({ label, hint, ...input }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} {...input} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
