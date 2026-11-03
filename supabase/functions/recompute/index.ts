// The retry for failed recomputes (spec: Sync endpoint). While any user is marked dirty, a job in
// the database calls this every five minutes, and it recomputes each of them. It takes nothing in
// and recomputing a user is always safe to repeat, but each call costs a connection and an
// invocation, so it answers 401 unless the request carries the shared secret in x-recompute-secret.
// The secret is the RECOMPUTE_SECRET function secret and the recompute_secret Vault secret.
import { Client } from '@db/postgres';
import { recompute } from '../_shared/recompute.ts';

// Compares SHA-256 digests with XOR so the time taken doesn't depend on where the values differ.
async function sameSecret(given: string, expected: string) {
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  return a.reduce((diff, byte, i) => diff | (byte ^ b[i]), 0) === 0;
}

Deno.serve(async (request) => {
  const expected = Deno.env.get('RECOMPUTE_SECRET');
  // Without a configured secret nobody gets in.
  if (!expected || !(await sameSecret(request.headers.get('x-recompute-secret') ?? '', expected))) {
    return new Response('unauthorized', { status: 401 });
  }
  const client = new Client(Deno.env.get('SUPABASE_DB_URL'));
  try {
    await client.connect();
    const { rows } = await client.queryObject<{ user_id: string }>`select user_id::text from private.dirty_users`;
    for (const { user_id } of rows) {
      // A user whose recompute fails again stays dirty for the next run.
      await recompute(client, user_id).catch((error) => console.error('Recompute failed', user_id, error));
    }
    return new Response('ok');
  } finally {
    await client.end();
  }
});
