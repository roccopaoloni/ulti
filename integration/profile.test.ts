import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'vitest';
import { newUser } from './users.ts';

type Lifter = { id: string; client: SupabaseClient };

async function lifter(name: string): Promise<Lifter> {
  const { id, device } = await newUser(name);
  return { id, client: device };
}

// What the phone's outbox sends for a dated history: the value in force from a local date on.
function entry(field: string, effectiveFrom: string, value: unknown, updatedAt = '2026-10-21T15:00:00.000Z') {
  return { id: crypto.randomUUID(), kind: 'saveProfileEntry', entry: { field, effectiveFrom, value, updatedAt } };
}

async function sync({ client }: Lifter, mutations: unknown[]) {
  const { data, error } = await client.functions.invoke('sync', { body: { mutations } });
  expect(error).toBeNull();
  return data as { rejected: string[] };
}

async function historyOf({ client }: Lifter) {
  const { data, error } = await client
    .from('profile_history')
    .select('field, effective_from, value')
    .order('field')
    .order('effective_from');
  expect(error).toBeNull();
  return data;
}

test("Ana's onboarding reaches the server as three dated histories", async () => {
  const ana = await lifter('ana');

  const response = await sync(ana, [
    entry('sex', '2026-10-21', 'female'),
    entry('bodyweightKg', '2026-10-21', 62.5),
    entry('weeklyTarget', '2026-10-26', 4),
  ]);

  expect(response).toEqual({ rejected: [] });
  expect(await historyOf(ana)).toEqual([
    { field: 'bodyweightKg', effective_from: '2026-10-21', value: 62.5 },
    { field: 'sex', effective_from: '2026-10-21', value: 'female' },
    { field: 'weeklyTarget', effective_from: '2026-10-26', value: 4 },
  ]);
});

test('a later bodyweight adds to the history, and an entry for the same date is replaced by the latest write', async () => {
  const ana = await lifter('ana');
  await sync(ana, [entry('bodyweightKg', '2026-10-21', 62.5, '2026-10-21T15:00:00.000Z')]);

  await sync(ana, [
    entry('bodyweightKg', '2026-11-04', 63),
    entry('bodyweightKg', '2026-10-21', 62, '2026-10-21T16:00:00.000Z'),
    // Arrives late, written before the correction above: changes nothing.
    entry('bodyweightKg', '2026-10-21', 99, '2026-10-21T15:30:00.000Z'),
  ]);

  expect(await historyOf(ana)).toEqual([
    { field: 'bodyweightKg', effective_from: '2026-10-21', value: 62 },
    { field: 'bodyweightKg', effective_from: '2026-11-04', value: 63 },
  ]);
});

test('a value outside what the field allows is rejected, and the rest of the batch is saved', async () => {
  const ana = await lifter('ana');
  const tooMany = entry('weeklyTarget', '2026-10-26', 7);
  const unknownSex = entry('sex', '2026-10-21', 'other');

  const response = await sync(ana, [tooMany, entry('weeklyTarget', '2026-10-26', 6), unknownSex]);

  expect(response).toEqual({ rejected: [tooMany.id, unknownSex.id] });
  expect(await historyOf(ana)).toEqual([{ field: 'weeklyTarget', effective_from: '2026-10-26', value: 6 }]);
});

test("Bea can't read Ana's sex or bodyweight, nor write to her history", async () => {
  const ana = await lifter('ana');
  const bea = await lifter('bea');
  await sync(ana, [entry('sex', '2026-10-21', 'female'), entry('bodyweightKg', '2026-10-21', 62.5)]);

  expect(await historyOf(bea)).toEqual([]);
  // Asking for Ana's rows by name returns nothing either.
  const byName = await bea.client.from('profile_history').select('value').eq('user_id', ana.id);
  expect(byName.data).toEqual([]);

  const direct = await bea.client
    .from('profile_history')
    .insert({ user_id: ana.id, field: 'bodyweightKg', effective_from: '2026-10-22', value: 40, updated_at: '2026-10-22T00:00:00Z' });
  expect(direct.error?.code).toBe('42501');

  // Bea's own sync only ever lands in Bea's history.
  await sync(bea, [entry('bodyweightKg', '2026-10-21', 80)]);
  expect(await historyOf(ana)).toEqual([
    { field: 'bodyweightKg', effective_from: '2026-10-21', value: 62.5 },
    { field: 'sex', effective_from: '2026-10-21', value: 'female' },
  ]);
});
