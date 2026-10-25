// Public health check (ADR 0006). An uptime monitor calls it every 5 minutes, which keeps
// the Free project from pausing and emails the owner when the backend is down.
import { Client } from '@db/postgres';

Deno.serve(async () => {
  const client = new Client(Deno.env.get('SUPABASE_DB_URL'));
  try {
    await client.connect();
    await client.queryArray('select 1');
    return new Response('ok');
  } catch {
    return new Response('database unavailable', { status: 503 });
  } finally {
    await client.end();
  }
});
