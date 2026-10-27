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

// A Bench Press Session of one Set, as the phone sends it; the Set can be written again later.
function benchSession() {
  const sessionId = crypto.randomUUID();
  const setId = crypto.randomUUID();
  const session = {
    id: sessionId,
    startedAt: '2026-10-19T21:05:00.000Z',
    timeZone: 'America/Argentina/Buenos_Aires',
    localDate: '2026-10-19',
    finishedAt: null,
    updatedAt: '2026-10-19T21:05:00.000Z',
  };
  const set = { id: setId, sessionId, exerciseId: 'bench-press', weightKg: 60, reps: 12, loggedAt: '2026-10-19T21:12:00.000Z' };
  return {
    setId,
    start: { id: crypto.randomUUID(), kind: 'saveSession', session },
    write: (updatedAt: string, rir?: number) => ({
      id: crypto.randomUUID(),
      kind: 'saveSet',
      set: { ...set, ...(rir !== undefined && { rir }), updatedAt },
    }),
  };
}

test("a Set's RIR syncs with the Set, and of two writes the later one wins whichever arrives first", async () => {
  const ana = await lifter('ana');
  const bench = benchSession();
  const rirs = async () => {
    const { data, error } = await ana.client.from('sets').select('rir');
    expect(error).toBeNull();
    return data;
  };

  await sync(ana, [bench.start, bench.write('2026-10-19T21:12:00.000Z')]);
  expect(await rirs()).toEqual([{ rir: null }]);

  await sync(ana, [bench.write('2026-10-19T21:13:00.000Z', 0)]);
  expect(await rirs()).toEqual([{ rir: 0 }]);

  // An earlier write arriving late changes nothing.
  await sync(ana, [bench.write('2026-10-19T21:12:30.000Z', 3)]);
  expect(await rirs()).toEqual([{ rir: 0 }]);
});

test("Ana's Increment override for an Exercise syncs, the later write wins whichever arrives first, and Bea can't see it", async () => {
  const ana = await lifter('ana');
  const bea = await lifter('bea');
  const override = (incrementKg: number, updatedAt: string) => ({
    id: crypto.randomUUID(),
    kind: 'saveIncrement',
    increment: { exerciseId: 'bench-press', incrementKg, updatedAt },
  });
  const overridesOf = async ({ client }: Lifter) => {
    const { data, error } = await client.from('increment_overrides').select('exercise_id, increment_kg');
    expect(error).toBeNull();
    return data;
  };

  await sync(ana, [override(1.25, '2026-10-20T10:05:00.000Z')]);
  await sync(ana, [override(5, '2026-10-20T10:00:00.000Z')]);

  expect(await overridesOf(ana)).toEqual([{ exercise_id: 'bench-press', increment_kg: 1.25 }]);
  expect(await overridesOf(bea)).toEqual([]);
});
