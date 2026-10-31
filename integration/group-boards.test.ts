import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'vitest';
import { newUser } from './users.ts';

type Lifter = { id: string; client: SupabaseClient };

// A signed-in user with the display name and avatar colour their Groups show.
async function lifter(name: string): Promise<Lifter> {
  const { id, device } = await newUser(name);
  const { error } = await device.from('profiles').upsert({ user_id: id, display_name: name, avatar_color: '#6fb6f7' });
  expect(error).toBeNull();
  return { id, client: device };
}

async function sync({ client }: Lifter, mutations: unknown[]) {
  const { error } = await client.functions.invoke('sync', { body: { mutations } });
  expect(error).toBeNull();
}

const weeklyTarget = (value: number) => ({
  id: crypto.randomUUID(),
  kind: 'saveProfileEntry',
  entry: { field: 'weeklyTarget', effectiveFrom: '2026-10-05', value, updatedAt: '2026-10-05T12:00:00.000Z' },
});

// One finished Session of six equal squat Sets (it qualifies for the Weekly Target but sets no
// Personal Record), started at the given UTC moment in the given time zone, on the given local date.
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

// A lifter who has trained on the given local dates against a Weekly Target of 3 (40 Consistency
// Points a Session).
async function trained(name: string, ...localDates: string[]) {
  const user = await lifter(name);
  await sync(user, [weeklyTarget(3), ...localDates.flatMap(utcSession)]);
  return user;
}

// A Group created by the first lifter, which the others join.
async function groupOf(owner: Lifter, ...others: Lifter[]) {
  const { data: id } = await owner.client.rpc('create_group', { name: 'Gym crew' });
  const [{ invite_code }] = (await owner.client.rpc('my_groups')).data;
  for (const other of others) await other.client.rpc('join_group', { invite_code });
  return id as string;
}

type Row = { position: number; display_name: string; points: number };
async function board(who: Lifter, groupId: string, period: 'week' | 'month' | 'year', onDate: string) {
  const { data, error } = await who.client.rpc('group_board', { group_id: groupId, period, on_date: onDate });
  expect(error).toBeNull();
  return data as { members: (Row & Record<string, unknown>)[] };
}
const standings = async (...args: Parameters<typeof board>) =>
  (await board(...args)).members.map(({ position, display_name, points }) => [position, display_name, points]);

test("the board marks the Group's Owner, and only them", async () => {
  const ana = await lifter('Ana');
  const bea = await lifter('Bea');
  const gymCrew = await groupOf(ana, bea);

  const { members } = await board(bea, gymCrew, 'week', '2026-10-21');

  expect(members.map(({ display_name, owner }) => [display_name, owner])).toEqual([
    ['Ana', true],
    ['Bea', false],
  ]);
});

// Wednesday 21 October 2026, in the week that starts Monday the 19th.
const wednesday = '2026-10-21';

test('the week board ranks members by Standard Points, and tied members share a position', async () => {
  const ana = await trained('Ana', '2026-10-19', '2026-10-21');
  const bea = await trained('Bea', '2026-10-20');
  const cy = await trained('Cy', '2026-10-22');
  const dee = await lifter('Dee');
  const gymCrew = await groupOf(ana, bea, cy, dee);

  expect(await standings(dee, gymCrew, 'week', wednesday)).toEqual([
    [1, 'Ana', 80],
    [2, 'Bea', 40],
    [2, 'Cy', 40],
    [4, 'Dee', 0],
  ]);
});

test("someone joining mid-Period brings the week's Scoring Events with them, and leaving takes them off the board", async () => {
  const ana = await trained('Ana', '2026-10-19');
  const bea = await trained('Bea', '2026-10-19', '2026-10-20');
  const gymCrew = await groupOf(ana);
  // Bea trained on Monday and Tuesday and joins on Wednesday.
  const [{ invite_code }] = (await ana.client.rpc('my_groups')).data;
  await bea.client.rpc('join_group', { invite_code });

  expect(await standings(ana, gymCrew, 'week', wednesday)).toEqual([
    [1, 'Bea', 80],
    [2, 'Ana', 40],
  ]);

  await bea.client.rpc('leave_group', { group_id: gymCrew });

  expect(await standings(ana, gymCrew, 'week', wednesday)).toEqual([[1, 'Ana', 40]]);
});

test('a Session counts on its own local date: Sunday night in Buenos Aires is in the week that ends, not the one that starts', async () => {
  // 01:30 UTC on Monday the 26th is still Sunday the 25th in Buenos Aires.
  const ana = await lifter('Ana');
  await sync(ana, [weeklyTarget(3), ...session('2026-10-26T01:30:00.000Z', 'America/Argentina/Buenos_Aires', '2026-10-25')]);
  const gymCrew = await groupOf(ana);

  expect(await standings(ana, gymCrew, 'week', wednesday)).toEqual([[1, 'Ana', 40]]);
  expect(await standings(ana, gymCrew, 'week', '2026-10-28')).toEqual([[1, 'Ana', 0]]);
  // The month and the year hold it too.
  expect(await standings(ana, gymCrew, 'month', '2026-10-28')).toEqual([[1, 'Ana', 40]]);
  expect(await standings(ana, gymCrew, 'year', '2026-02-01')).toEqual([[1, 'Ana', 40]]);
  expect(await standings(ana, gymCrew, 'year', '2027-01-01')).toEqual([[1, 'Ana', 0]]);
});

// A Session with one Working Set of back squat. Ana's first two set her baseline (100 × 6); her
// third, 105 × 6, is a Personal Record worth 110 Progress Points and a gain of 5%.
function squatSession(localDate: string, weightKg: number) {
  const sessionId = crypto.randomUUID();
  const at = `${localDate}T21:00:00.000Z`;
  return [
    { id: crypto.randomUUID(), kind: 'saveSession', session: { id: sessionId, startedAt: at, timeZone: 'UTC', localDate, finishedAt: at, updatedAt: at } },
    { id: crypto.randomUUID(), kind: 'saveSet', set: { id: crypto.randomUUID(), sessionId, exerciseId: 'back-squat', weightKg, reps: 6, loggedAt: at, updatedAt: at } },
  ];
}

test("the board shows a member's points, Session dots and Personal Records, and nothing a Group member mustn't see", async () => {
  const ana = await lifter('Ana');
  await sync(ana, [
    weeklyTarget(3),
    ...squatSession('2026-10-05', 100),
    ...squatSession('2026-10-12', 100),
    ...squatSession('2026-10-19', 105),
    ...utcSession('2026-10-20'),
  ]);
  const bea = await lifter('Bea');
  const gymCrew = await groupOf(ana, bea);

  const { members } = await board(bea, gymCrew, 'week', wednesday);

  // 110 Progress Points and 40 Consistency Points. The Session dots count the qualifying Sessions.
  expect(members[0]).toEqual({
    user_id: ana.id,
    position: 1,
    display_name: 'Ana',
    avatar_color: '#6fb6f7',
    former: false,
    owner: true,
    me: false,
    points: 150,
    tier: 'bronze',
    division: 5,
    weekly_target: 3,
    session_dates: ['2026-10-20'],
    records: [{ exercise: 'back-squat', percent_gain: 5, points: 110 }],
  });
  // Nor can Bea read Ana's events, or the bodyweight and sex Ana gave, from the tables.
  for (const table of ['scoring_events', 'profile_history']) {
    const read = await bea.client.from(table).select().eq('user_id', ana.id);
    // Either no rows come back, or the read is refused outright (once no one reads events directly).
    expect(read.data ?? []).toEqual([]);
  }
});

test("each member's Rank on the board comes from their Season Points, not the Period's", async () => {
  // Seven full weeks of a Weekly Target of 3 in the first quarter (no other test trains then) are 840 Consistency Points in that
  // Season: Silver V. The week the board shows (the last of the Season) has none of them.
  const ana = await lifter('Ana');
  const mondays = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02', '2026-02-09', '2026-02-16'];
  const days = mondays.flatMap((monday) => [0, 1, 2].map((offset) => new Date(Date.parse(monday) + offset * 86_400_000).toISOString().slice(0, 10)));
  await sync(ana, [
    { ...weeklyTarget(3), entry: { ...weeklyTarget(3).entry, effectiveFrom: '2026-01-01' } },
    ...days.flatMap(utcSession),
  ]);
  const bea = await lifter('Bea');
  const gymCrew = await groupOf(ana, bea);

  const { members } = await board(bea, gymCrew, 'week', '2026-03-30');

  const rows = members.map(({ display_name, points, tier, division }) => [display_name, points, tier, division]);
  expect(rows).toEqual([
    ['Ana', 0, 'silver', 5],
    ['Bea', 0, 'bronze', 5],
  ]);
});

test("a user who isn't in the Group can't read its board", async () => {
  const ana = await lifter('Ana');
  const cy = await lifter('Cy');
  const gymCrew = await groupOf(ana);

  const read = await cy.client.rpc('group_board', { group_id: gymCrew, period: 'week', on_date: wednesday });

  expect(read.error?.message).toBe('not_member');
});
