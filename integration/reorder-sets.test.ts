import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'vitest';
import { scoringEventsOf } from './sql.ts';
import { newUser } from './users.ts';

type Lifter = { id: string; client: SupabaseClient };

async function lifter(name: string): Promise<Lifter> {
  const { id, device } = await newUser(name);
  return { id, client: device };
}

async function sync({ client }: Lifter, mutations: unknown[]) {
  const { error } = await client.functions.invoke('sync', { body: { mutations } });
  expect(error).toBeNull();
}

const session = (localDate: string) => {
  const id = crypto.randomUUID();
  const at = `${localDate}T21:00:00.000Z`;
  return {
    id,
    mutation: {
      id: crypto.randomUUID(),
      kind: 'saveSession',
      session: { id, startedAt: at, timeZone: 'UTC', localDate, finishedAt: `${localDate}T22:00:00.000Z`, updatedAt: `${localDate}T22:00:00.000Z` },
    },
  };
};

const set = (sessionId: string, localDate: string, minute: number, weightKg: number, reps: number) => {
  const at = `${localDate}T21:${String(minute).padStart(2, '0')}:00.000Z`;
  return { id: crypto.randomUUID(), sessionId, exerciseId: 'back-squat', weightKg, reps, loggedAt: at, updatedAt: at };
};

const save = (record: object) => ({ id: crypto.randomUUID(), kind: 'saveSet', set: record });

// Ana's two squat Sessions set her baseline (100 × 6, e1RM 120). In her third she logged 100 × 7
// (e1RM 123.3, a Personal Record) and then a single of 115 kg. Logged in that order, 100 kg is
// under 90% of the heaviest Set, so it is a Warm-up Set and earns nothing.
async function anaWithATwoSetSession() {
  const ana = await lifter('ana');
  const baseline = ['2026-10-05', '2026-10-12'].map((date) => {
    const s = session(date);
    return [s.mutation, save(set(s.id, date, 0, 100, 6))];
  });
  const third = session('2026-10-19');
  const reps = set(third.id, '2026-10-19', 1, 100, 7);
  const single = set(third.id, '2026-10-19', 2, 115, 1);
  await sync(ana, [...baseline.flat(), third.mutation, save(reps), save(single)]);
  return { ana, reps, single };
}

// Dragging the single in front, as the phone writes it: every Set of the Exercise with its place.
const dragged = (reps: object, single: object, updatedAt: string) => [
  save({ ...single, position: 0, updatedAt }),
  save({ ...reps, position: 1, updatedAt }),
];

const positions = async ({ client }: Lifter) => {
  const { data, error } = await client.from('sets').select('id, position').order('logged_at');
  expect(error).toBeNull();
  return data;
};

test("a Set's position syncs with the Set, and Sets saved before have none", async () => {
  const { ana, reps, single } = await anaWithATwoSetSession();
  expect((await positions(ana))!.map(({ position }) => position)).toEqual([null, null, null, null]);

  await sync(ana, dragged(reps, single, '2026-10-19T21:30:00.000Z'));

  expect((await positions(ana))!.filter(({ id }) => id === reps.id || id === single.id)).toEqual([
    { id: reps.id, position: 1 },
    { id: single.id, position: 0 },
  ]);
});

test('the recompute follows the position, not the logged time: dragged in front, the single lets the 100 kg Set count as a Working Set', async () => {
  const { ana, reps, single } = await anaWithATwoSetSession();
  expect(await scoringEventsOf(ana.id)).toEqual([]);

  await sync(ana, dragged(reps, single, '2026-10-19T21:30:00.000Z'));

  expect((await scoringEventsOf(ana.id)).map(({ event }) => [event.kind, event.setId])).toEqual([['personal-record', reps.id]]);
});

test('the Sets arriving again after the drag, or the drag twice, ends in the same state', async () => {
  const { ana, reps, single } = await anaWithATwoSetSession();
  const drag = dragged(reps, single, '2026-10-19T21:30:00.000Z');
  await sync(ana, drag);
  const expected = await scoringEventsOf(ana.id);

  // The Sets as they were first logged arrive again, late: the drag is the later write.
  await sync(ana, [save(reps), save(single)]);
  await sync(ana, drag);

  expect(await scoringEventsOf(ana.id)).toEqual(expected);
  expect((await positions(ana))!.filter(({ id }) => id === single.id)).toEqual([{ id: single.id, position: 0 }]);
});
