import { expect, test, vi } from 'vitest';
import { sql } from './sql';
import { newUser } from './users';

// CI starts the local stack with `supabase start`; its API listens on the port in supabase/config.toml.
const apiUrl = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const recomputeUrl = `${apiUrl}/functions/v1/recompute`;

const isDirty = (userId: string) => sql(`select count(*) from private.dirty_users where user_id = '${userId}'`) === '1';
const markDirty = (userId: string) => sql(`insert into private.dirty_users (user_id) values ('${userId}') on conflict do nothing`);

test('recompute answers 401 and does nothing when the secret is missing or wrong', async () => {
  const ana = await newUser('ana');
  markDirty(ana.id);

  const without = await fetch(recomputeUrl, { method: 'POST' });
  const wrong = await fetch(recomputeUrl, { method: 'POST', headers: { 'x-recompute-secret': 'not-the-secret' } });

  expect(without.status).toBe(401);
  expect(wrong.status).toBe(401);
  expect(isDirty(ana.id)).toBe(true);
});

test('the scheduled job sends the secret, so it still recomputes a dirty user and clears the mark', { timeout: 60_000 }, async () => {
  const ana = await newUser('ana');
  markDirty(ana.id);

  sql(`do $$ begin execute (select command from cron.job where jobname = 'recompute-dirty-users'); end $$`);

  await vi.waitFor(() => expect(isDirty(ana.id)).toBe(false), { timeout: 30_000, interval: 500 });
});
