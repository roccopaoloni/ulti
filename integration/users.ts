import { createClient } from '@supabase/supabase-js';
import { setTimeout as sleep } from 'node:timers/promises';
import { expect } from 'vitest';

// CI starts the local stack with `supabase start`; its ports are in supabase/config.toml.
const apiUrl = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// Every local stack uses this publishable key (`supabase status` prints it).
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
// The local stack's test inbox (Mailpit): it catches every email the stack sends.
const inboxUrl = 'http://127.0.0.1:54324';

// One device, holding its session in memory. Nobody is signed in on it yet.
export function device() {
  return createClient(apiUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// A user who has signed up and verified their email with its code, signed in on their first device,
// and who can sign in on as many more devices as they like.
export async function newUser(name: string) {
  const email = `${name.toLowerCase()}.${crypto.randomUUID()}@example.com`;
  const password = 'squat-every-monday';
  const first = device();
  const signUp = await first.auth.signUp({ email, password, options: { data: { language: 'en' } } });
  expect(signUp.error).toBeNull();
  const verified = await first.auth.verifyOtp({ email, token: await codeSentTo(email), type: 'email' });
  expect(verified.error).toBeNull();

  const signIn = async () => {
    const another = device();
    const { error } = await another.auth.signInWithPassword({ email, password });
    expect(error).toBeNull();
    return another;
  };
  return { id: verified.data.user!.id, device: first, signIn };
}

// The 6-digit code in the sign-up email, once it has arrived.
async function codeSentTo(to: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const search = await fetch(`${inboxUrl}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const [summary] = ((await search.json()) as { messages: { ID: string }[] }).messages;
    if (summary) {
      const { HTML } = (await (await fetch(`${inboxUrl}/api/v1/message/${summary.ID}`)).json()) as { HTML: string };
      return HTML.replace(/<[^>]*>/g, ' ').match(/\b\d{6}\b/)![0];
    }
    await sleep(200);
  }
  throw new Error(`No code ever reached ${to}`);
}
