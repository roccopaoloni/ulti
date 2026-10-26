// The retry for failed recomputes (spec: Sync endpoint). While any user is marked dirty, a job in
// the database calls this every five minutes, and it recomputes each of them. It's public, like
// health: it takes nothing in, and recomputing a user is always safe to repeat.
import { Client } from '@db/postgres';
import { recompute } from '../_shared/recompute.ts';

Deno.serve(async () => {
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
