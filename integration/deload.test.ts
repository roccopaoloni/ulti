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
  const { data, error } = await client.functions.invoke('sync', { body: { mutations } });
  expect(error).toBeNull();
  return data as { rejected: string[] };
}

const weeklyTarget = (value: number) => ({
  id: crypto.randomUUID(),
  kind: 'saveProfileEntry',
  entry: { field: 'weeklyTarget', effectiveFrom: '2026-10-05', value, updatedAt: '2026-10-05T12:00:00.000Z' },
});

// One finished Session of three equal squat Sets: enough to qualify only as a Deload Session,
// which the phone records when the Session starts.
function lightSession(localDate: string, deload = true) {
  const startedAt = `${localDate}T12:00:00.000Z`;
  const sessionId = crypto.randomUUID();
  const sets = [0, 1, 2].map((minute) => {
    const at = new Date(Date.parse(startedAt) + minute * 60_000).toISOString();
    return { id: crypto.randomUUID(), sessionId, exerciseId: 'back-squat', weightKg: 90, reps: 5, loggedAt: at, updatedAt: at };
  });
  return [
    { id: crypto.randomUUID(), kind: 'saveSession', session: { id: sessionId, startedAt, timeZone: 'UTC', localDate, finishedAt: startedAt, updatedAt: startedAt, ...(deload ? { deload } : {}) } },
    ...sets.map((set) => ({ id: crypto.randomUUID(), kind: 'saveSet', set })),
  ];
}

// What the phone's outbox sends when the lifter accepts or dismisses a Deload Week, or starts one.
const deload = (week: string, status: 'accepted' | 'dismissed', updatedAt: string, origin: 'suggested' | 'self' = 'suggested') => ({
  id: crypto.randomUUID(),
  kind: 'saveDeload',
  deload: { week, origin, status, updatedAt },
});

const weeks = async (ana: Lifter) => (await storedScoringEvents(ana.id)).map(({ event }) => [event.week, event.sessionDates, event.consistencyPoints]);

test('a Deload Session scores with three Working Sets, a normal Session in the same Deload Week does not, and the server stores the record', async () => {
  const ana = await lifter('ana');
  const sessions = [lightSession('2026-10-19'), lightSession('2026-10-20'), lightSession('2026-10-22', false)].flat();

  await sync(ana, [weeklyTarget(3), deload('2026-10-19', 'accepted', '2026-10-19T10:00:00.000Z', 'self'), ...sessions]);
  expect(await weeks(ana)).toEqual([['2026-10-19', ['2026-10-19', '2026-10-20'], expect.any(Number)]]);

  const stored = await ana.client.from('sessions').select('local_date, deload').order('local_date');
  expect(stored.data).toEqual([
    { local_date: '2026-10-19', deload: true },
    { local_date: '2026-10-20', deload: true },
    { local_date: '2026-10-22', deload: false },
  ]);
});

test('a Deload Session keeps counting after its Deload Week is dismissed, and Sessions in a Deload Week that are not Deload Sessions never did', async () => {
  const ana = await lifter('ana');
  await sync(ana, [weeklyTarget(3), ...lightSession('2026-10-19'), ...lightSession('2026-10-20', false)]);
  await sync(ana, [deload('2026-10-19', 'accepted', '2026-10-19T10:00:00.000Z')]);
  expect(await weeks(ana)).toEqual([['2026-10-19', ['2026-10-19'], expect.any(Number)]]);
  await sync(ana, [deload('2026-10-19', 'dismissed', '2026-10-19T11:00:00.000Z')]);
  expect(await weeks(ana)).toEqual([['2026-10-19', ['2026-10-19'], expect.any(Number)]]);
});

test('a Session once marked as a Deload Session stays one when it is saved again without the mark', async () => {
  const ana = await lifter('ana');
  const [start, ...sets] = lightSession('2026-10-19');
  await sync(ana, [weeklyTarget(3), start, ...sets]);
  // An older phone saves the same Session later, with no mark.
  const { deload: _mark, ...unmarked } = (start as any).session;
  await sync(ana, [{ id: crypto.randomUUID(), kind: 'saveSession', session: { ...unmarked, finishedAt: '2026-10-19T13:00:00.000Z', updatedAt: '2026-10-19T13:00:00.000Z' } }]);

  const stored = await ana.client.from('sessions').select('finished_at, deload');
  expect(stored.data).toEqual([{ finished_at: '2026-10-19T13:00:00+00:00', deload: true }]);
});

test('a self-started Deload Week is stored, its Deload Sessions score, and only the lifter can read hers', async () => {
  const ana = await lifter('ana');
  const bea = await lifter('bea');

  await sync(ana, [weeklyTarget(3), ...lightSession('2026-10-19'), deload('2026-10-19', 'accepted', '2026-10-19T10:00:00.000Z', 'self')]);

  expect((await weeks(ana)).map(([week]) => week)).toEqual(['2026-10-19']);
  const { data, error } = await ana.client.from('deload_weeks').select('week, origin, status');
  expect(error).toBeNull();
  expect(data).toEqual([{ week: '2026-10-19', origin: 'self', status: 'accepted' }]);
  expect((await bea.client.from('deload_weeks').select('week')).data).toEqual([]);
});

test('a Deload Week that does not start on a Monday is rejected', async () => {
  const ana = await lifter('ana');
  const wednesday = deload('2026-10-21', 'accepted', '2026-10-21T10:00:00.000Z');

  expect((await sync(ana, [wednesday])).rejected).toEqual([wednesday.id]);
  expect((await ana.client.from('deload_weeks').select('week')).data).toEqual([]);
});
