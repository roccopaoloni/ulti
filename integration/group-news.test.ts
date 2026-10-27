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

// One finished Session of the given number of equal squat Sets on a local date (UTC). From six Sets
// on it qualifies for the Weekly Target; with fewer it is only a Session that doesn't count.
function session(localDate: string, setCount = 6) {
  const sessionId = crypto.randomUUID();
  const startedAt = `${localDate}T12:00:00.000Z`;
  const sets = Array.from({ length: setCount }, (_, minute) => {
    const at = new Date(Date.parse(startedAt) + minute * 60_000).toISOString();
    return { id: crypto.randomUUID(), sessionId, exerciseId: 'back-squat', weightKg: 100, reps: 5, loggedAt: at, updatedAt: at };
  });
  return [
    { id: crypto.randomUUID(), kind: 'saveSession', session: { id: sessionId, startedAt, timeZone: 'UTC', localDate, finishedAt: startedAt, updatedAt: startedAt } },
    ...sets.map((set) => ({ id: crypto.randomUUID(), kind: 'saveSet', set })),
  ];
}

// A lifter with a Weekly Target of 3 (40 Consistency Points a Session) who has trained on the given
// local dates.
async function trained(name: string, ...localDates: string[]) {
  const user = await lifter(name);
  await sync(user, [weeklyTarget(3), ...localDates.flatMap((date) => session(date))]);
  return user;
}

// A Group created by the first lifter, which the others join.
async function groupOf(owner: Lifter, ...others: Lifter[]) {
  const { data: id } = await owner.client.rpc('create_group', { name: 'Gym crew' });
  const [{ invite_code }] = (await owner.client.rpc('my_groups')).data;
  for (const other of others) await other.client.rpc('join_group', { invite_code });
  return id as string;
}

type Who = { display_name: string; me: boolean };
type News = { trained_today: { display_name: string; avatar_color: string }[]; passes: { passer: Who; passed: Who }[] };
async function news(who: Lifter, groupId: string, since: string, onDate: string) {
  const { data, error } = await who.client.rpc('group_news', { group_id: groupId, since, on_date: onDate });
  expect(error).toBeNull();
  return data as News;
}

// Wednesday 21 October 2026, in the week that starts Monday the 19th.
const wednesday = '2026-10-21';
const monday = '2026-10-19';

test("friends who trained today are the other members with a qualifying Session on the caller's today", async () => {
  const ana = await trained('Ana', '2026-10-20', wednesday);
  const bea = await trained('Bea', '2026-10-20');
  const cy = await lifter('Cy');
  await sync(cy, [weeklyTarget(3), ...session(wednesday, 1)]);
  const dee = await trained('Dee', wednesday);
  const gymCrew = await groupOf(ana, bea, cy, dee);

  const { trained_today } = await news(dee, gymCrew, wednesday, wednesday);

  // Not Bea (yesterday), not Cy (a Session too short to qualify), not Dee herself.
  expect(trained_today).toEqual([{ display_name: 'Ana', avatar_color: '#6fb6f7' }]);
});

test('since the last visit, the news says who passed whom in the week, and only that', async () => {
  const ana = await trained('Ana', monday);
  const bea = await trained('Bea', '2026-10-20', wednesday);
  const cy = await lifter('Cy');
  const gymCrew = await groupOf(ana, bea, cy);

  // At the end of Monday, Ana led with 40 points and Bea and Cy had none. Since then Bea scored 80.
  const seenByAna = await news(ana, gymCrew, monday, wednesday);

  expect(seenByAna.passes).toEqual([{ passer: { display_name: 'Bea', me: false }, passed: { display_name: 'Ana', me: true } }]);
  // Everything the news holds is a name, a colour or a flag: no points, weights, reps or dates.
  expect(Object.keys(seenByAna).sort()).toEqual(['passes', 'trained_today']);
  expect(seenByAna.trained_today).toEqual([{ display_name: 'Bea', avatar_color: '#6fb6f7' }]);
});

test('a visit before the week began has no passes: the week starts from nothing', async () => {
  const ana = await trained('Ana', monday);
  const bea = await trained('Bea', '2026-10-20', wednesday);
  const gymCrew = await groupOf(ana, bea);

  expect((await news(ana, gymCrew, '2026-10-16', wednesday)).passes).toEqual([]);
});

test("a user who isn't in the Group can't read its news", async () => {
  const ana = await lifter('Ana');
  const cy = await lifter('Cy');
  const gymCrew = await groupOf(ana);

  const read = await cy.client.rpc('group_news', { group_id: gymCrew, since: monday, on_date: wednesday });

  expect(read.error?.message).toBe('not_member');
});
