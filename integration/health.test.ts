import { expect, test } from 'vitest';

// CI starts the local stack with `supabase start`; its API listens on the port in supabase/config.toml.
const apiUrl = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';

test('health answers 200, with no key, while the database answers', async () => {
  const response = await fetch(`${apiUrl}/functions/v1/health`);

  expect(response.status).toBe(200);
});
