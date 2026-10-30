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
  return data as { rejected: string[]; moved?: { id: string; effectiveFrom: string }[] };
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

// Local dates relative to the real clock. The server doesn't know the user's time zone, so
// yesterday in UTC is before the next Monday wherever she is.
const day = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
const mondayAfter = (localDate: string) => {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (8 - (date.getUTCDay() || 7)));
  return date.toISOString().slice(0, 10);
};

// The earliest Monday the server lets a change start on, whatever the user's time zone.
const earliestMonday = () => mondayAfter(new Date(Date.now() - 12 * 3_600_000).toISOString().slice(0, 10));

test('a Weekly Target change backdated before next Monday is saved from the earliest Monday instead, and reported as moved', async () => {
  const ana = await lifter('ana');
  await sync(ana, [entry('weeklyTarget', '2026-10-05', 4)]);
  const backdated = entry('weeklyTarget', day(-1), 2);
  const later = entry('weeklyTarget', mondayAfter(day(8)), 5);
  const bodyweight = entry('bodyweightKg', day(-1), 63);

  const response = await sync(ana, [backdated, later, bodyweight]);

  expect(response).toEqual({ rejected: [], moved: [{ id: backdated.id, effectiveFrom: earliestMonday() }] });
  expect(await historyOf(ana)).toEqual([
    { field: 'bodyweightKg', effective_from: day(-1), value: 63 },
    { field: 'weeklyTarget', effective_from: '2026-10-05', value: 4 },
    { field: 'weeklyTarget', effective_from: earliestMonday(), value: 2 },
    { field: 'weeklyTarget', effective_from: mondayAfter(day(8)), value: 5 },
  ]);
});

test('a moved Weekly Target change and another for the same Monday: the latest write wins', async () => {
  const ana = await lifter('ana');
  await sync(ana, [entry('weeklyTarget', '2026-10-05', 4)]);
  const backdated = entry('weeklyTarget', day(-1), 2, '2026-10-21T15:00:00.000Z');
  const onTheMonday = entry('weeklyTarget', earliestMonday(), 6, '2026-10-22T15:00:00.000Z');

  await sync(ana, [backdated, onTheMonday]);

  expect(await historyOf(ana)).toEqual([
    { field: 'weeklyTarget', effective_from: '2026-10-05', value: 4 },
    { field: 'weeklyTarget', effective_from: earliestMonday(), value: 6 },
  ]);
});

test("a user's first Weekly Target keeps its own date: the day it is set, or earlier if it was set offline", async () => {
  const ana = await lifter('ana');
  const bea = await lifter('bea');

  expect(await sync(ana, [entry('weeklyTarget', day(0), 3)])).toEqual({ rejected: [] });
  expect(await sync(bea, [entry('weeklyTarget', day(-10), 3)])).toEqual({ rejected: [] });
  expect(await historyOf(ana)).toEqual([{ field: 'weeklyTarget', effective_from: day(0), value: 3 }]);
});

test('in a first batch, only the earliest Weekly Target keeps its own date', async () => {
  const ana = await lifter('ana');
  const first = entry('weeklyTarget', day(-3), 3);
  const backdatedChange = entry('weeklyTarget', day(-1), 2);

  const response = await sync(ana, [backdatedChange, first]);

  expect(response).toEqual({ rejected: [], moved: [{ id: backdatedChange.id, effectiveFrom: earliestMonday() }] });
  expect(await historyOf(ana)).toEqual([
    { field: 'weeklyTarget', effective_from: day(-3), value: 3 },
    { field: 'weeklyTarget', effective_from: earliestMonday(), value: 2 },
  ]);
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
