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

// What the phone's outbox sends for "I don't follow a routine", set or cleared.
function noRoutine(value: unknown, updatedAt: string) {
  return { id: crypto.randomUUID(), kind: 'saveNoRoutine', noRoutine: { value, updatedAt } };
}

function saveRoutine(days: unknown[], updatedAt: string) {
  return { id: crypto.randomUUID(), kind: 'saveRoutine', routine: { id: crypto.randomUUID(), days, updatedAt } };
}

const push = { id: 'push', name: 'Push', exercises: [{ exerciseId: 'bench-press', sets: 3, repMin: 8, repMax: 12 }] };

// What a phone that is new to the user reads back.
async function followsNoRoutine({ client }: Lifter) {
  const { data, error } = await client.from('profiles').select('no_routine').maybeSingle();
  expect(error).toBeNull();
  return data?.no_routine ?? false;
}

test("Ana's \"I don't follow a routine\" is stored on the server and read back on a new phone", async () => {
  const ana = await lifter('ana');
  expect(await followsNoRoutine(ana)).toBe(false);

  expect(await sync(ana, [noRoutine(true, '2026-10-21T15:00:00.000Z')])).toEqual({ rejected: [] });

  expect(await followsNoRoutine(ana)).toBe(true);
});

test('of two writes of the choice the later one wins whichever arrives first', async () => {
  const ana = await lifter('ana');
  await sync(ana, [noRoutine(true, '2026-10-21T15:00:00.000Z')]);

  // Arrives late, written before the choice above: changes nothing.
  await sync(ana, [noRoutine(false, '2026-10-21T14:00:00.000Z')]);
  expect(await followsNoRoutine(ana)).toBe(true);

  await sync(ana, [noRoutine(false, '2026-10-21T16:00:00.000Z')]);
  expect(await followsNoRoutine(ana)).toBe(false);
});

test('saving a Routine clears the choice, unless the choice was made after it', async () => {
  const ana = await lifter('ana');
  await sync(ana, [noRoutine(true, '2026-10-21T15:00:00.000Z')]);

  // Written before the choice: the choice stands.
  await sync(ana, [saveRoutine([push], '2026-10-21T14:00:00.000Z')]);
  expect(await followsNoRoutine(ana)).toBe(true);

  await sync(ana, [saveRoutine([push], '2026-10-21T16:00:00.000Z')]);
  expect(await followsNoRoutine(ana)).toBe(false);

  // A choice made later than the Routine, in the same batch or not, is kept.
  await sync(ana, [noRoutine(true, '2026-10-21T17:00:00.000Z')]);
  expect(await followsNoRoutine(ana)).toBe(true);
});

test('a Routine with no Sessions in it is no Routine, so it does not clear the choice', async () => {
  const ana = await lifter('ana');
  await sync(ana, [noRoutine(true, '2026-10-21T15:00:00.000Z'), saveRoutine([], '2026-10-21T16:00:00.000Z')]);

  expect(await followsNoRoutine(ana)).toBe(true);
});

test('a choice that is not a yes or no is rejected, and the rest of the batch is saved', async () => {
  const ana = await lifter('ana');
  const maybe = noRoutine('maybe', '2026-10-21T15:00:00.000Z');

  expect(await sync(ana, [maybe, noRoutine(true, '2026-10-21T15:00:00.000Z')])).toEqual({ rejected: [maybe.id] });

  expect(await followsNoRoutine(ana)).toBe(true);
});

test("one lifter's choice is not another's", async () => {
  const [ana, bea] = [await lifter('ana'), await lifter('bea')];
  await sync(ana, [noRoutine(true, '2026-10-21T15:00:00.000Z')]);

  expect(await followsNoRoutine(bea)).toBe(false);
});
