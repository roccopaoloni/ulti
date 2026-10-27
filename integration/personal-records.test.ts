import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'vitest';
import { scoringEventsOf as storedScoringEvents } from './sql.ts';
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

// No user can read Scoring Events through the API, so the tests read them straight from the database.
const scoringEventsOf = async ({ id }: Lifter) => storedScoringEvents(id);

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
        progressPoints: 110,
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
  expect((await scoringEventsOf(ana)).map(({ event }) => [event.newE1rm, event.progressPoints])).toEqual([[132, 150]]);

  await sync(ana, [rewrite(third.setRecord, { weightKg: 95, updatedAt: '2026-10-26T12:00:00.000Z' })]);
  expect(await scoringEventsOf(ana)).toEqual([]);
});

test('deleting the Set that set a Personal Record removes the event', async () => {
  const { ana, third } = await anaWithARecord();

  await sync(ana, [rewrite(third.setRecord, { deleted: true })]);

  expect(await scoringEventsOf(ana)).toEqual([]);
});

test('a ramp in one Session stores a single Personal Record, for its best Set', async () => {
  const { ana, third } = await anaWithARecord();
  const ramp = (weightKg: number, minute: number) => ({
    id: crypto.randomUUID(),
    kind: 'saveSet',
    set: {
      ...third.setRecord,
      id: crypto.randomUUID(),
      weightKg,
      loggedAt: `2026-10-19T21:0${minute}:00.000Z`,
      updatedAt: `2026-10-19T21:0${minute}:00.000Z`,
    },
  });
  const top = ramp(120, 3);

  await sync(ana, [ramp(110, 1), top, ramp(115, 5)]);

  expect((await scoringEventsOf(ana)).map(({ event }) => [event.setId, event.previousE1rm])).toEqual([[top.set.id, 120]]);
});

test("flipping the Set's label to Warm-up removes the Personal Record it had earned", async () => {
  const { ana, third } = await anaWithARecord();

  await sync(ana, [rewrite(third.setRecord, { label: 'warm-up' })]);

  expect(await scoringEventsOf(ana)).toEqual([]);
});

test("Ana's sex and bodyweight weight her Personal Record, the event records what was used, and nobody else can read it", async () => {
  const ana = await lifter('ana');
  const bea = await lifter('bea');
  const entry = (field: string, value: unknown) => ({
    id: crypto.randomUUID(),
    kind: 'saveProfileEntry',
    entry: { field, effectiveFrom: '2026-10-01', value, updatedAt: '2026-10-01T09:00:00.000Z' },
  });
  await sync(ana, [
    entry('sex', 'male'),
    entry('bodyweightKg', 83),
    ...squatSession('2026-10-05', 100, 6).mutations,
    ...squatSession('2026-10-12', 100, 6).mutations,
    ...squatSession('2026-10-19', 105, 6).mutations,
  ]);

  // A male 83 kg lifter's 126 kg e1RM squat is at the 53.93rd percentile of FitnessVolt's gym
  // standards, which weights the 5% gain's 110 points up to 120.
  const [{ event }] = await scoringEventsOf(ana);
  expect(event.strengthLevelPercentile).toBeCloseTo(53.93, 1);
  expect(event.bodyweightKg).toBe(83);
  expect(event.progressPoints).toBe(120);

  const { data } = await bea.client.from('profile_history').select('*');
  expect(data).toEqual([]);
});

test("a signed-in user can't read Scoring Events at all, their own included, so their Strength Level never reaches them", async () => {
  const { ana } = await anaWithARecord();

  const { data, error } = await ana.client.from('scoring_events').select('id, event');

  expect(error?.code).toBe('42501');
  expect(data).toBeNull();
});

test('pull-ups are scored at the lifter\'s four-week average bodyweight plus the added weight', async () => {
  const ana = await lifter('ana');
  const checkIn = (effectiveFrom: string, value: number) => ({
    id: crypto.randomUUID(),
    kind: 'saveProfileEntry',
    entry: { field: 'bodyweightKg', effectiveFrom, value, updatedAt: '2026-10-21T15:00:00.000Z' },
  });
  // Ana weighs 82 kg until 5 Oct and 78 kg after: 14 days each, an average of 80 kg on 19 Oct.
  const pullUpSession = (localDate: string, addedKg: number) => {
    const { setRecord, mutations } = squatSession(localDate, addedKg, 6);
    return { setRecord: { ...setRecord, exerciseId: 'pull-up' }, mutations: [mutations[0], { ...mutations[1], set: { ...setRecord, exerciseId: 'pull-up' } }] };
  };
  const first = pullUpSession('2026-10-05', 0);
  const second = pullUpSession('2026-10-12', 0);
  const third = pullUpSession('2026-10-19', 4);

  await sync(ana, [checkIn('2026-09-01', 82), checkIn('2026-10-06', 78), ...first.mutations, ...second.mutations, ...third.mutations]);

  // Her best was 82 kg × (1 + 6/30) = 98.4; the record is (80 + 4) kg × 1.2 = 100.8.
  expect(await scoringEventsOf(ana)).toEqual([
    {
      id: `${ana.id}:personal-record:${third.setRecord.id}`,
      event: expect.objectContaining({ exercise: 'pull-up', bodyweightKg: 80, previousE1rm: expect.closeTo(98.4), newE1rm: expect.closeTo(100.8) }),
    },
  ]);
});
