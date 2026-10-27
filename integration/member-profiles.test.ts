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

async function visibility({ id, client }: Lifter, settings: { share_weights?: boolean; share_sessions?: boolean }) {
  const { error } = await client.from('profiles').upsert({ user_id: id, ...settings });
  expect(error).toBeNull();
}

const profileEntry = (field: string, value: unknown) => ({
  id: crypto.randomUUID(),
  kind: 'saveProfileEntry',
  entry: { field, effectiveFrom: '2026-10-05', value, updatedAt: '2026-10-05T12:00:00.000Z' },
});

// A finished Session of the given squat Sets, on the given local date.
function squatSession(localDate: string, ...sets: { weightKg: number; reps: number }[]) {
  const sessionId = crypto.randomUUID();
  const at = `${localDate}T21:00:00.000Z`;
  return [
    { id: crypto.randomUUID(), kind: 'saveSession', session: { id: sessionId, startedAt: at, timeZone: 'UTC', localDate, finishedAt: at, updatedAt: at } },
    ...sets.map((set, index) => ({
      id: crypto.randomUUID(),
      kind: 'saveSet',
      set: { id: crypto.randomUUID(), sessionId, exerciseId: 'back-squat', ...set, loggedAt: new Date(Date.parse(at) + index * 60_000).toISOString(), updatedAt: at },
    })),
  ];
}

// Ana's first two squat Sessions set her baseline (100 × 6); on the 19th, 105 × 6 is a Personal
// Record worth 50 Progress Points and a gain of 5%; on the 20th she squats 100 × 5 six times,
// enough for 40 Consistency Points.
const sixSets = [0, 1, 2, 3, 4, 5].map(() => ({ weightKg: 100, reps: 5 }));
async function ana() {
  const user = await lifter('Ana');
  await sync(user, [
    profileEntry('weeklyTarget', 3),
    ...squatSession('2026-10-05', { weightKg: 100, reps: 6 }),
    ...squatSession('2026-10-12', { weightKg: 100, reps: 6 }),
    ...squatSession('2026-10-19', { weightKg: 105, reps: 6 }),
    ...squatSession('2026-10-20', ...sixSets),
  ]);
  return user;
}

async function groupOf(owner: Lifter, ...others: Lifter[]) {
  const { data: id } = await owner.client.rpc('create_group', { name: 'Gym crew' });
  const [{ invite_code }] = (await owner.client.rpc('my_groups')).data;
  for (const other of others) await other.client.rpc('join_group', { invite_code });
  return id as string;
}

// Wednesday 21 October 2026, in the week that starts Monday the 19th.
const wednesday = '2026-10-21';
async function profileOf(viewer: Lifter, member: Lifter, groupId: string) {
  return viewer.client.rpc('member_profile', { group_id: groupId, member_id: member.id, period: 'week', on_date: wednesday });
}

const alwaysVisible = {
  display_name: 'Ana',
  avatar_color: '#6fb6f7',
  me: false,
  position: 1,
  points: 90,
  session_count: 2,
};
const record = { exercise: 'back-squat', percent_gain: 5, points: 50, local_date: '2026-10-19' };

test('by default a member profile shows only Points, Rank, Session count and Personal Records as %', async () => {
  const user = await ana();
  const bea = await lifter('Bea');
  const gymCrew = await groupOf(user, bea);

  const { data, error } = await profileOf(bea, user, gymCrew);

  expect(error).toBeNull();
  expect(data).toEqual({
    ...alwaysVisible,
    shares_weights: false,
    shares_sessions: false,
    records: [record],
    sessions: null,
  });
});

test('turning on actual weights and reps adds them to the Personal Records, not the Session details', async () => {
  const user = await ana();
  const bea = await lifter('Bea');
  const gymCrew = await groupOf(user, bea);
  await visibility(user, { share_weights: true });

  const { data } = await profileOf(bea, user, gymCrew);

  expect(data).toEqual({
    ...alwaysVisible,
    shares_weights: true,
    shares_sessions: false,
    records: [{ ...record, weight_kg: 105, reps: 6 }],
    sessions: null,
  });
});

test('turning on full Session details lists the Sessions and their Exercises without weights or reps', async () => {
  const user = await ana();
  const bea = await lifter('Bea');
  const gymCrew = await groupOf(user, bea);
  await visibility(user, { share_sessions: true });

  const { data } = await profileOf(bea, user, gymCrew);

  expect(data).toEqual({
    ...alwaysVisible,
    shares_weights: false,
    shares_sessions: true,
    records: [record],
    sessions: [
      { local_date: '2026-10-20', sets: sixSets.map(() => ({ exercise: 'back-squat' })) },
      { local_date: '2026-10-19', sets: [{ exercise: 'back-squat' }] },
    ],
  });
});

test('with both on, the Sessions carry every Set weight and reps', async () => {
  const user = await ana();
  const bea = await lifter('Bea');
  const gymCrew = await groupOf(user, bea);
  await visibility(user, { share_weights: true, share_sessions: true });

  const { data } = await profileOf(bea, user, gymCrew);

  expect(data.sessions).toEqual([
    { local_date: '2026-10-20', sets: sixSets.map(() => ({ exercise: 'back-squat', weight_kg: 100, reps: 5 })) },
    { local_date: '2026-10-19', sets: [{ exercise: 'back-squat', weight_kg: 105, reps: 6 }] },
  ]);
});

test('one Visibility choice applies in every Group, and turning it off hides it again', async () => {
  const user = await ana();
  const bea = await lifter('Bea');
  const cy = await lifter('Cy');
  const gymCrew = await groupOf(user, bea);
  const { data: lunchClub } = await cy.client.rpc('create_group', { name: 'Lunch club' });
  const [{ invite_code }] = (await cy.client.rpc('my_groups')).data;
  await user.client.rpc('join_group', { invite_code });
  await visibility(user, { share_weights: true });

  expect((await profileOf(bea, user, gymCrew)).data.shares_weights).toBe(true);
  expect((await profileOf(cy, user, lunchClub as string)).data.shares_weights).toBe(true);

  await visibility(user, { share_weights: false });

  expect((await profileOf(bea, user, gymCrew)).data.shares_weights).toBe(false);
  expect((await profileOf(cy, user, lunchClub as string)).data.records[0]).toEqual(record);
});

test('sex, bodyweight and Strength Level are in no profile, whatever the member shares', async () => {
  const user = await ana();
  await sync(user, [profileEntry('sex', 'female'), profileEntry('bodyweightKg', 62.5)]);
  await visibility(user, { share_weights: true, share_sessions: true });
  const bea = await lifter('Bea');
  const gymCrew = await groupOf(user, bea);

  const text = JSON.stringify((await profileOf(bea, user, gymCrew)).data).toLowerCase();

  for (const secret of ['sex', 'female', 'bodyweight', '62.5', 'strength', 'percentile']) expect(text).not.toContain(secret);
});

test("only a Group's members can open a member's profile, and only of members of that Group", async () => {
  const user = await ana();
  const bea = await lifter('Bea');
  const cy = await lifter('Cy');
  const gymCrew = await groupOf(user, bea);

  expect((await profileOf(cy, user, gymCrew)).error?.message).toBe('not_member');
  expect((await profileOf(bea, cy, gymCrew)).error?.message).toBe('not_member');
});
