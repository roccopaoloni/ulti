import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'vitest';
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

// One finished Session with one Working Set of back squat, as the phone's outbox sends them.
function squatSession(localDate: string, weightKg: number, reps: number) {
  const sessionId = crypto.randomUUID();
  const at = `${localDate}T21:00:00.000Z`;
  const setRecord = { id: crypto.randomUUID(), sessionId, exerciseId: 'back-squat', weightKg, reps, loggedAt: at, updatedAt: at };
  return {
    setRecord,
    mutations: [
      {
        id: crypto.randomUUID(),
        kind: 'saveSession',
        session: { id: sessionId, startedAt: at, timeZone: 'UTC', localDate, finishedAt: at, updatedAt: at },
      },
      { id: crypto.randomUUID(), kind: 'saveSet', set: setRecord },
    ],
  };
}

// A later write of the same Set, as an edit, a delete or a label flip.
const rewrite = (setRecord: object, change: object) => ({
  id: crypto.randomUUID(),
  kind: 'saveSet',
  set: { ...setRecord, updatedAt: '2026-10-25T12:00:00.000Z', ...change },
});

async function scoringEventsOf({ client }: Lifter) {
  const { data, error } = await client.from('scoring_events').select('id, event').order('id');
  expect(error).toBeNull();
  return data!;
}

// Ana's first two squat Sessions set her baseline (100 × 6, e1RM 120); her third, 105 × 6 (126), is a Personal Record.
async function anaWithARecord() {
  const ana = await lifter('ana');
  const first = squatSession('2026-10-05', 100, 6);
  const second = squatSession('2026-10-12', 100, 6);
  const third = squatSession('2026-10-19', 105, 6);
  await sync(ana, [...first.mutations, ...second.mutations, ...third.mutations]);
  return { ana, third };
}

test("Ana's third squat Session stores a Personal Record with its facts, and replaying the batch changes nothing", async () => {
  const { ana, third } = await anaWithARecord();

  const stored = await scoringEventsOf(ana);
  expect(stored).toEqual([
    {
      id: `${ana.id}:personal-record:${third.setRecord.id}`,
      event: expect.objectContaining({
        kind: 'personal-record',
        exercise: 'back-squat',
        setId: third.setRecord.id,
        localDate: '2026-10-19',
        previousE1rm: 120,
        newE1rm: 126,
        percentGain: 5,
        strengthLevelPercentile: 50,
        progressPoints: 50,
        rulesVersion: expect.any(Number),
      }),
    },
  ]);
  await sync(ana, third.mutations);
  expect(await scoringEventsOf(ana)).toEqual(stored);
});

test('editing the Set that set a Personal Record changes the stored event, and a later edit that no longer beats the best removes it', async () => {
  const { ana, third } = await anaWithARecord();

  await sync(ana, [rewrite(third.setRecord, { weightKg: 110 })]);
  expect((await scoringEventsOf(ana)).map(({ event }) => [event.newE1rm, event.progressPoints])).toEqual([[132, 100]]);

  await sync(ana, [rewrite(third.setRecord, { weightKg: 95, updatedAt: '2026-10-26T12:00:00.000Z' })]);
  expect(await scoringEventsOf(ana)).toEqual([]);
});

test('deleting the Set that set a Personal Record removes the event', async () => {
  const { ana, third } = await anaWithARecord();

  await sync(ana, [rewrite(third.setRecord, { deleted: true })]);

  expect(await scoringEventsOf(ana)).toEqual([]);
});

test("flipping the Set's label to Warm-up removes the Personal Record it had earned", async () => {
  const { ana, third } = await anaWithARecord();

  await sync(ana, [rewrite(third.setRecord, { label: 'warm-up' })]);

  expect(await scoringEventsOf(ana)).toEqual([]);
});
