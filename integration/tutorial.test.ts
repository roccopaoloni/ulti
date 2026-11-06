import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'vitest';
import { newUser } from './users.ts';

type Lifter = { id: string; client: SupabaseClient };

async function lifter(name: string): Promise<Lifter> {
  const { id, device } = await newUser(name);
  return { id, client: device };
}

async function sync({ client }: Lifter, mutations: unknown[]) {
  const { data, error } = await client.functions.invoke('sync', { body: { mutations } });
  expect(error).toBeNull();
  return data as { rejected: string[] };
}

// What the phone's outbox sends when the lifter finishes or skips the Tutorial.
const tutorialSeen = () => ({ id: crypto.randomUUID(), kind: 'saveTutorialSeen' });

// What a phone that is new to the user reads back.
async function sawTutorial({ client }: Lifter) {
  const { data, error } = await client.from('profiles').select('tutorial_seen').maybeSingle();
  expect(error).toBeNull();
  return data?.tutorial_seen ?? false;
}

test('an account made after the migration has not seen the Tutorial', async () => {
  expect(await sawTutorial(await lifter('ana'))).toBe(false);
});

test("Ana's finished Tutorial is stored on the server and read back on a new phone", async () => {
  const ana = await lifter('ana');

  expect(await sync(ana, [tutorialSeen()])).toEqual({ rejected: [] });

  expect(await sawTutorial(ana)).toBe(true);
});

test('sending it twice changes nothing', async () => {
  const ana = await lifter('ana');
  await sync(ana, [tutorialSeen()]);
  await sync(ana, [tutorialSeen()]);

  expect(await sawTutorial(ana)).toBe(true);
});

test("one lifter's Tutorial is not another's, and nobody can read or write it for another", async () => {
  const [ana, bea] = [await lifter('ana'), await lifter('bea')];
  await sync(ana, [tutorialSeen()]);

  expect(await sawTutorial(bea)).toBe(false);
  const { data } = await bea.client.from('profiles').select('tutorial_seen').eq('user_id', ana.id);
  expect(data).toEqual([]);
  await bea.client.from('profiles').update({ tutorial_seen: false }).eq('user_id', ana.id);
  expect(await sawTutorial(ana)).toBe(true);
});
