import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'vitest';
import { device, newUser } from './users.ts';

type Lifter = { id: string; client: SupabaseClient };

async function lifter(name: string): Promise<Lifter> {
  const { id, device } = await newUser(name);
  return { id, client: device };
}

async function sync({ client }: Lifter, mutations: unknown[]) {
  const { error } = await client.functions.invoke('sync', { body: { mutations } });
  expect(error).toBeNull();
}

// A Weekly Target of 2, so each qualifying Session earns 60 Consistency Points.
const weeklyTargetOf2 = () => ({
  id: crypto.randomUUID(),
  kind: 'saveProfileEntry',
  entry: { field: 'weeklyTarget', effectiveFrom: '2026-06-01', value: 2, updatedAt: '2026-10-05T12:00:00.000Z' },
});

// One finished Session of six equal squat Sets on a local date, as the phone's outbox sends it.
function session(localDate: string) {
  const startedAt = `${localDate}T12:00:00.000Z`;
  const sessionId = crypto.randomUUID();
  const sets = [0, 1, 2, 3, 4, 5].map((minute) => {
    const at = new Date(Date.parse(startedAt) + minute * 60_000).toISOString();
    return { id: crypto.randomUUID(), sessionId, exerciseId: 'back-squat', weightKg: 100, reps: 5, loggedAt: at, updatedAt: at };
  });
  return [
    { id: crypto.randomUUID(), kind: 'saveSession', session: { id: sessionId, startedAt, timeZone: 'UTC', localDate, finishedAt: startedAt, updatedAt: startedAt } },
    ...sets.map((set) => ({ id: crypto.randomUUID(), kind: 'saveSet', set })),
  ];
}

// No other test trains in April to September 2026, so these Seasons hold only the users made here.
const SEASON_DAY = '2026-08-20';

async function standing({ client }: Lifter, onDate = SEASON_DAY) {
  const { data, error } = await client.rpc('season_standing', { on_date: onDate });
  expect(error).toBeNull();
  return data;
}

test("each lifter sees their own Season Rank Points, position and top X%, with ties sharing a position, and nothing of anyone else's", async () => {
  const [ana, bo, cy, dee] = await Promise.all(['ana', 'bo', 'cy', 'dee'].map(lifter));
  await sync(ana, [weeklyTargetOf2(), ...session('2026-08-03'), ...session('2026-08-04')]);
  await sync(bo, [weeklyTargetOf2(), ...session('2026-08-10'), ...session('2026-08-11')]);
  await sync(cy, [weeklyTargetOf2(), ...session('2026-08-03')]);
  // Dee's only Session is in the Season before, so she has no Points in this one.
  await sync(dee, [weeklyTargetOf2(), ...session('2026-06-29')]);

  expect(await standing(ana)).toEqual({ points: 120, position: 1, top_percent: 67 });
  expect(await standing(bo)).toEqual({ points: 120, position: 1, top_percent: 67 });
  expect(await standing(cy)).toEqual({ points: 60, position: 3, top_percent: 100 });
  expect(await standing(dee)).toEqual({ points: 0, position: null, top_percent: null });
  // The earlier Season holds only Dee's Session.
  expect(await standing(dee, '2026-06-30')).toEqual({ points: 60, position: 1, top_percent: 100 });
});

test('signed-out visitors cannot ask for a standing', async () => {
  const { error } = await device().rpc('season_standing', { on_date: SEASON_DAY });
  expect(error).not.toBeNull();
});
