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

const push = { id: 'push', name: 'Push', exercises: [{ exerciseId: 'bench-press', sets: 3, repMin: 8, repMax: 12 }] };
const pull = { id: 'pull', name: 'Pull', exercises: [{ exerciseId: 'barbell-row', sets: 4, repMin: 6, repMax: 10 }] };

// What the phone's outbox sends for a Routine.
function saveRoutine(id: string, days: unknown[], updatedAt: string) {
  return { id: crypto.randomUUID(), kind: 'saveRoutine', routine: { id, days, updatedAt } };
}

async function routinesOf({ client }: Lifter) {
  const { data, error } = await client.from('routines').select('id, days');
  expect(error).toBeNull();
  return data;
}

test("Ana's Routine syncs, and of two edits the later one wins whichever arrives first", async () => {
  const ana = await lifter('ana');
  const id = crypto.randomUUID();

  expect(await sync(ana, [saveRoutine(id, [push], '2026-10-20T10:00:00.000Z')])).toEqual({ rejected: [] });
  expect(await routinesOf(ana)).toEqual([{ id, days: [push] }]);

  await sync(ana, [saveRoutine(id, [push, pull], '2026-10-21T10:00:00.000Z')]);
  // Arrives late, written before the edit above: changes nothing.
  await sync(ana, [saveRoutine(id, [pull], '2026-10-20T12:00:00.000Z')]);

  expect(await routinesOf(ana)).toEqual([{ id, days: [push, pull] }]);
});

test("a Session started from a Routine Day keeps which Day it was", async () => {
  const ana = await lifter('ana');
  const sessionId = crypto.randomUUID();
  await sync(ana, [
    {
      id: crypto.randomUUID(),
      kind: 'saveSession',
      session: {
        id: sessionId,
        startedAt: '2026-10-19T21:05:00.000Z',
        timeZone: 'America/Argentina/Buenos_Aires',
        localDate: '2026-10-19',
        finishedAt: null,
        routineDayId: 'push',
        updatedAt: '2026-10-19T21:05:00.000Z',
      },
    },
  ]);

  const { data, error } = await ana.client.from('sessions').select('routine_day_id').eq('id', sessionId);
  expect(error).toBeNull();
  expect(data).toEqual([{ routine_day_id: 'push' }]);
});

test("Bea can't read Ana's Routine or write it, directly or through a sync", async () => {
  const ana = await lifter('ana');
  const bea = await lifter('bea');
  const id = crypto.randomUUID();
  await sync(ana, [saveRoutine(id, [push], '2026-10-20T10:00:00.000Z')]);

  expect(await routinesOf(bea)).toEqual([]);
  const direct = await bea.client.from('routines').insert({ user_id: bea.id, id: crypto.randomUUID(), days: [], updated_at: new Date().toISOString() });
  expect(direct.error).not.toBeNull();

  // Bea syncing the same Routine ID makes her own, and leaves Ana's alone.
  await sync(bea, [saveRoutine(id, [pull], '2026-10-22T10:00:00.000Z')]);
  expect(await routinesOf(ana)).toEqual([{ id, days: [push] }]);
  expect(await routinesOf(bea)).toEqual([{ id, days: [pull] }]);
});
