import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'vitest';
import { newUser } from './users.ts';

type Lifter = { id: string; client: SupabaseClient };

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

// A Session of `count` back squat Sets of the given weight and 6 reps on a local date.
function session(localDate: string, weightKg: number, count: number) {
  const sessionId = crypto.randomUUID();
  const at = (minute: number) => new Date(Date.parse(`${localDate}T12:00:00.000Z`) + minute * 60_000).toISOString();
  return [
    { id: crypto.randomUUID(), kind: 'saveSession', session: { id: sessionId, startedAt: at(0), timeZone: 'UTC', localDate, finishedAt: at(0), updatedAt: at(0) } },
    ...Array.from({ length: count }, (_, minute) => ({
      id: crypto.randomUUID(),
      kind: 'saveSet',
      set: { id: crypto.randomUUID(), sessionId, exerciseId: 'back-squat', weightKg, reps: 6, loggedAt: at(minute), updatedAt: at(minute) },
    })),
  ];
}

// Ana's baseline squat is 100 × 6; her Personal Record on Monday the 19th is 50 Progress Points.
// She also earns 40 Consistency Points (Weekly Target of 3) in each of the weeks of the 19th, the
// 26th and 2 November. So the week of the 19th is worth 90 Standard, 50 PR Hunt and 40 Grind.
async function ana() {
  const user = await lifter('Ana');
  await sync(user, [
    weeklyTarget(3),
    ...session('2026-10-05', 100, 1),
    ...session('2026-10-12', 100, 1),
    ...session('2026-10-19', 105, 1),
    ...session('2026-10-20', 100, 6),
    ...session('2026-10-27', 100, 6),
    ...session('2026-11-02', 100, 6),
  ]);
  const { data: id } = await user.client.rpc('create_group', { name: 'Gym crew' });
  return { user, groupId: id as string };
}

async function board({ client }: Lifter, groupId: string, period: 'week' | 'month' | 'year', onDate: string) {
  const { data, error } = await client.rpc('group_board', { group_id: groupId, period, on_date: onDate });
  expect(error).toBeNull();
  const { scoring_mode, members } = data as { scoring_mode: string; members: { points: number }[] };
  return [scoring_mode, members[0].points];
}

const setMode = ({ client }: Lifter, groupId: string, mode: string, onDate: string) =>
  client.rpc('set_scoring_mode', { group_id: groupId, mode, on_date: onDate });

test('a Group starts on Standard, and a Mode change applies from the next week and the next month', async () => {
  const { user, groupId } = await ana();
  expect(await board(user, groupId, 'week', '2026-10-21')).toEqual(['standard', 90]);

  expect((await setMode(user, groupId, 'prHunt', '2026-10-21')).error).toBeNull();

  // The week and the month already running keep Standard; the next week and the next month are PR Hunt.
  expect(await board(user, groupId, 'week', '2026-10-21')).toEqual(['standard', 90]);
  expect(await board(user, groupId, 'month', '2026-10-21')).toEqual(['standard', 130]);
  expect(await board(user, groupId, 'week', '2026-10-28')).toEqual(['prHunt', 0]);
  expect(await board(user, groupId, 'month', '2026-11-03')).toEqual(['prHunt', 0]);
});

test("a change made on a Period's first day still waits for the next Period, and later changes make a history", async () => {
  const { user, groupId } = await ana();

  await setMode(user, groupId, 'grind', '2026-10-26');
  await setMode(user, groupId, 'prHunt', '2026-11-03');

  expect(await board(user, groupId, 'week', '2026-10-21')).toEqual(['standard', 90]);
  expect(await board(user, groupId, 'week', '2026-10-28')).toEqual(['standard', 40]);
  // The week of 2 November is Grind, as chosen on the 26th; the week of the 9th is PR Hunt.
  expect(await board(user, groupId, 'week', '2026-11-03')).toEqual(['grind', 40]);
  expect(await board(user, groupId, 'week', '2026-11-10')).toEqual(['prHunt', 0]);
});

test('the Mode scores the same events: Grind counts Consistency Points only', async () => {
  const { user, groupId } = await ana();
  await setMode(user, groupId, 'grind', '2026-10-05');

  expect(await board(user, groupId, 'week', '2026-10-21')).toEqual(['grind', 40]);
  await setMode(user, groupId, 'prHunt', '2026-10-12');
  expect(await board(user, groupId, 'week', '2026-10-21')).toEqual(['prHunt', 50]);
});

test('the yearly board is always Standard, whatever the Group chose', async () => {
  const { user, groupId } = await ana();
  await setMode(user, groupId, 'grind', '2026-09-01');

  expect(await board(user, groupId, 'week', '2026-10-21')).toEqual(['grind', 40]);
  expect(await board(user, groupId, 'year', '2026-10-21')).toEqual(['standard', 170]);
});

test('only the Owner changes the Mode, and only to a Mode that exists', async () => {
  const { user, groupId } = await ana();
  const bea = await lifter('Bea');
  const [{ invite_code }] = (await user.client.rpc('my_groups')).data;
  await bea.client.rpc('join_group', { invite_code });

  expect((await setMode(bea, groupId, 'grind', '2026-10-21')).error?.message).toBe('not_owner');
  expect((await setMode(user, groupId, 'chaos', '2026-10-21')).error?.message).toBe('invalid_mode');
  expect(await board(bea, groupId, 'week', '2026-10-28')).toEqual(['standard', 40]);
});

test("a member's profile scores its Period with the same Mode as the board", async () => {
  const { user, groupId } = await ana();
  await setMode(user, groupId, 'prHunt', '2026-09-01');
  const profile = (period: string) =>
    user.client.rpc('member_profile', { group_id: groupId, member_id: user.id, period, on_date: '2026-10-21' }).then(({ data }) => data.points);

  expect(await profile('week')).toBe(50);
  expect(await profile('year')).toBe(170);
});
