import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { expect, test } from 'vitest';

// CI starts the local stack with `supabase start`; its API listens on the port in supabase/config.toml.
const apiUrl = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// The local database's container, named after project_id in supabase/config.toml.
const databaseContainer = 'supabase_db_ulti';

const health = () => fetch(`${apiUrl}/functions/v1/health`);

test('health answers 200, with no key, while the database answers', async () => {
  const response = await health();

  expect(response.status).toBe(200);
});

test('health answers 503 while the database does not answer', { timeout: 120_000 }, async () => {
  docker('stop', databaseContainer);
  try {
    const response = await health();

    expect(response.status).toBe(503);
  } finally {
    docker('start', databaseContainer);
    while (docker('inspect', '--format', '{{.State.Health.Status}}', databaseContainer) !== 'healthy') {
      await sleep(1_000);
    }
  }
});

function docker(...args: string[]) {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}
