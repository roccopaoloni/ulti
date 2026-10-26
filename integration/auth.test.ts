import { createClient } from '@supabase/supabase-js';
import { setTimeout as sleep } from 'node:timers/promises';
import { expect, test } from 'vitest';

// CI starts the local stack with `supabase start`; its ports are in supabase/config.toml.
const apiUrl = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// Every local stack uses this publishable key (`supabase status` prints it).
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
// The local stack's test inbox (Mailpit): it catches every email the stack sends.
const inboxUrl = 'http://127.0.0.1:54324';

// One device, holding its session in memory.
function device() {
  return createClient(apiUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// A new address for every user, so runs never share one.
function newAddress(name: string) {
  return `${name}.${crypto.randomUUID()}@example.com`;
}

// The nth email (counting from 1) sent to an address, once it has arrived, with the 6-digit code it shows.
async function email(to: string, nth = 1) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const search = await fetch(`${inboxUrl}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    // Newest first.
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    const summary = messages[messages.length - nth];
    if (summary) {
      const message = (await (await fetch(`${inboxUrl}/api/v1/message/${summary.ID}`)).json()) as {
        Subject: string;
        HTML: string;
      };
      const text = message.HTML.replace(/<[^>]*>/g, ' ');
      return { subject: message.Subject, html: message.HTML, code: text.match(/\b\d{6}\b/)?.[0] };
    }
    await sleep(200);
  }
  throw new Error(`Email ${nth} never reached ${to}`);
}

test('Ana signs up and verifies her email by typing in the 6-digit code it sends, not a link', async () => {
  const ana = device();
  const address = newAddress('ana');

  const signUp = await ana.auth.signUp({
    email: address,
    password: 'squat-every-monday',
    options: { data: { language: 'en' } },
  });
  expect(signUp.error).toBeNull();
  // Nobody is signed in before they verify.
  expect(signUp.data.session).toBeNull();

  const { html, code } = await email(address);
  expect(code).toMatch(/^\d{6}$/);
  expect(html).not.toMatch(/href|https?:\/\//);

  const wrong = await ana.auth.verifyOtp({ email: address, token: code === '000000' ? '111111' : '000000', type: 'email' });
  expect(wrong.error?.code).toBe('otp_expired');

  const verified = await ana.auth.verifyOtp({ email: address, token: code!, type: 'email' });
  expect(verified.error).toBeNull();
  expect(verified.data.session?.user.email).toBe(address);
});

test("Ana can't sign in before she verifies her email, and a code sent again verifies it", async () => {
  const ana = device();
  const address = newAddress('ana');
  const password = 'squat-every-monday';
  await ana.auth.signUp({ email: address, password, options: { data: { language: 'en' } } });

  const refused = await ana.auth.signInWithPassword({ email: address, password });
  expect(refused.error?.code).toBe('email_not_confirmed');

  await email(address);
  // A new code can be asked for once [auth.email] max_frequency has passed.
  await sleep(1_100);
  const resent = await ana.auth.resend({ type: 'signup', email: address });
  expect(resent.error).toBeNull();
  const { code } = await email(address, 2);

  const verified = await ana.auth.verifyOtp({ email: address, token: code!, type: 'email' });
  expect(verified.error).toBeNull();
  const signedIn = await device().auth.signInWithPassword({ email: address, password });
  expect(signedIn.data.session?.user.email).toBe(address);
});

test('Ana resets a forgotten password with the 6-digit code it sends, not a link', async () => {
  const address = newAddress('ana');
  const laptop = device();
  await laptop.auth.signUp({ email: address, password: 'squat-every-monday', options: { data: { language: 'en' } } });
  await laptop.auth.verifyOtp({ email: address, token: (await email(address)).code!, type: 'email' });

  const phone = device();
  const asked = await phone.auth.resetPasswordForEmail(address);
  expect(asked.error).toBeNull();
  const { html, code } = await email(address, 2);
  expect(code).toMatch(/^\d{6}$/);
  expect(html).not.toMatch(/href|https?:\/\//);

  const verified = await phone.auth.verifyOtp({ email: address, token: code!, type: 'recovery' });
  expect(verified.error).toBeNull();
  const changed = await phone.auth.updateUser({ password: 'deadlift-on-fridays' });
  expect(changed.error).toBeNull();

  const oldPassword = await device().auth.signInWithPassword({ email: address, password: 'squat-every-monday' });
  expect(oldPassword.error?.code).toBe('invalid_credentials');
  const newPassword = await device().auth.signInWithPassword({ email: address, password: 'deadlift-on-fridays' });
  expect(newPassword.data.session?.user.email).toBe(address);
});
