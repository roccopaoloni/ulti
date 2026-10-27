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

// What the phone's outbox sends for a Weekly Target: the value in force from a local date on.
const weeklyTarget = (effectiveFrom: string, value: number) => ({
  id: crypto.randomUUID(),
  kind: 'saveProfileEntry',
  entry: { field: 'weeklyTarget', effectiveFrom, value, updatedAt: '2026-10-05T12:00:00.000Z' },
});

// One finished Session of six equal squat Sets, as the phone's outbox sends it. It starts at the
// given UTC moment, in the given time zone, on the given local date.
function session(startedAt: string, timeZone: string, localDate: string) {
  const sessionId = crypto.randomUUID();
  const sets = [0, 1, 2, 3, 4, 5].map((minute) => {
    const at = new Date(Date.parse(startedAt) + minute * 60_000).toISOString();
    return { id: crypto.randomUUID(), sessionId, exerciseId: 'back-squat', weightKg: 100, reps: 5, loggedAt: at, updatedAt: at };
  });
  return [
    { id: crypto.randomUUID(), kind: 'saveSession', session: { id: sessionId, startedAt, timeZone, localDate, finishedAt: startedAt, updatedAt: startedAt } },
    ...sets.map((set) => ({ id: crypto.randomUUID(), kind: 'saveSet', set })),
  ];
}

const utcSession = (localDate: string) => session(`${localDate}T12:00:00.000Z`, 'UTC', localDate);

// No user can read Scoring Events through the API, so the tests read them straight from the database.
const scoringEventsOf = async ({ id }: Lifter) => storedScoringEvents(id);

test("Ana's two qualifying Sessions against a Weekly Target of 3 store the week's Consistency Points, and replaying changes nothing", async () => {
  const ana = await lifter('ana');
  const batch = [weeklyTarget('2026-10-05', 3), ...utcSession('2026-10-19'), ...utcSession('2026-10-21')];

  await sync(ana, batch);

  const stored = await scoringEventsOf(ana);
  expect(stored).toEqual([
    {
      id: `${ana.id}:consistency:2026-10-19`,
      event: expect.objectContaining({
        kind: 'consistency',
        week: '2026-10-19',
        weeklyTarget: 3,
        sessionDates: ['2026-10-19', '2026-10-21'],
        rulesVersion: expect.any(Number),
        consistencyPoints: expect.any(Number),
      }),
    },
  ]);
  expect(stored[0].event.consistencyPoints).toBeGreaterThan(0);
  await sync(ana, batch);
  expect(await scoringEventsOf(ana)).toEqual(stored);
});

test("a Session ending Sunday night in Buenos Aires counts in the week that ends, though it is Monday in UTC", async () => {
  const ana = await lifter('ana');

  await sync(ana, [
    weeklyTarget('2026-10-05', 3),
    ...session('2026-10-26T01:30:00.000Z', 'America/Argentina/Buenos_Aires', '2026-10-25'),
  ]);

  expect((await scoringEventsOf(ana)).map(({ id }) => id)).toEqual([`${ana.id}:consistency:2026-10-19`]);
});

test('a Weekly Target change syncing after the Sessions still applies only from its Monday', async () => {
  const ana = await lifter('ana');
  await sync(ana, [weeklyTarget('2026-10-05', 4), ...utcSession('2026-10-19'), ...utcSession('2026-10-27'), ...utcSession('2026-10-28')]);
  const before = await scoringEventsOf(ana);
  expect(before.map(({ event }) => [event.week, event.weeklyTarget])).toEqual([
    ['2026-10-19', 4],
    ['2026-10-26', 4],
  ]);

  await sync(ana, [weeklyTarget('2026-10-26', 2)]);

  const after = await scoringEventsOf(ana);
  expect(after.map(({ event }) => [event.week, event.weeklyTarget])).toEqual([
    ['2026-10-19', 4],
    ['2026-10-26', 2],
  ]);
  expect(after[0]).toEqual(before[0]);
});
