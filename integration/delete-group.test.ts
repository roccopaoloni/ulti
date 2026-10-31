import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'vitest';
import { sql } from './sql.ts';
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

// A lifter with two finished Sessions in the week of Monday 19 October 2026, on a Weekly Target of 3.
async function trained(name: string) {
  const user = await lifter(name);
  const sessions = ['2026-10-19', '2026-10-20'].flatMap((localDate) => {
    const startedAt = `${localDate}T12:00:00.000Z`;
    const sessionId = crypto.randomUUID();
    const sets = [0, 1, 2, 3, 4, 5].map((minute) => {
      const at = new Date(Date.parse(startedAt) + minute * 60_000).toISOString();
      return {
        id: crypto.randomUUID(),
        kind: 'saveSet',
        set: { id: crypto.randomUUID(), sessionId, exerciseId: 'back-squat', weightKg: 100, reps: 5, loggedAt: at, updatedAt: at },
      };
    });
    return [
      {
        id: crypto.randomUUID(),
        kind: 'saveSession',
        session: { id: sessionId, startedAt, timeZone: 'UTC', localDate, finishedAt: startedAt, updatedAt: startedAt },
      },
      ...sets,
    ];
  });
  await sync(user, [
    {
      id: crypto.randomUUID(),
      kind: 'saveProfileEntry',
      entry: { field: 'weeklyTarget', effectiveFrom: '2026-01-05', value: 3, updatedAt: '2026-01-05T12:00:00.000Z' },
    },
    ...sessions,
  ]);
  return user;
}

// A Group created by the first lifter, which the others join, backdated so the finalizer counts it.
async function groupOf(owner: Lifter, ...others: Lifter[]) {
  const { data: id } = await owner.client.rpc('create_group', { name: 'Gym crew' });
  const [{ invite_code }] = (await owner.client.rpc('my_groups')).data;
  for (const other of others) await other.client.rpc('join_group', { invite_code });
  // The creator joined first, so they stay the Owner.
  sql(`update public.group_members set joined_at = '2026-01-02T00:00:00Z' where group_id = '${id}'`);
  sql(`update public.group_members set joined_at = '2026-01-01T00:00:00Z' where group_id = '${id}' and user_id = '${owner.id}'`);
  return id as string;
}

const names = async ({ client }: Lifter) =>
  ((await client.rpc('my_groups')).data as { name: string }[]).map(({ name }) => name);
const standing = async ({ client }: Lifter) => (await client.rpc('season_standing', { on_date: '2026-10-22' })).data;
const stamps = async ({ client }: Lifter) => (await client.rpc('my_season_stamps')).data;
const crowns = async ({ client }: Lifter) => (await client.rpc('my_crowns')).data as unknown[];
const count = (table: string, where: string) => Number(sql(`select count(*) from public.${table} where ${where}`));

test('the Owner deletes the Group: no member sees it, its board or its Period results', async () => {
  const ana = await trained('Ana');
  const bea = await trained('Bea');
  const gymCrew = await groupOf(ana, bea);
  sql(`select private.finalize_periods('2026-10-26T10:00:00Z')`);
  expect(await crowns(ana)).toHaveLength(1);
  expect(count('period_results', `group_id = '${gymCrew}'`)).toBeGreaterThan(0);

  const deleted = await ana.client.rpc('delete_group', { group_id: gymCrew });

  expect(deleted.error).toBeNull();
  for (const member of [ana, bea]) {
    expect(await names(member)).toEqual([]);
    const board = await member.client.rpc('group_board', { group_id: gymCrew, period: 'week', on_date: '2026-10-21' });
    expect(board.error).not.toBeNull();
  }
  expect(count('period_results', `group_id = '${gymCrew}'`)).toBe(0);
  expect(count('group_members', `group_id = '${gymCrew}'`)).toBe(0);
  expect(await crowns(ana)).toEqual([]);
});

test("deleting a Group leaves every member's Points, Rank, Season results, Sessions and other Groups alone", async () => {
  const ana = await trained('Ana');
  const bea = await trained('Bea');
  const gymCrew = await groupOf(ana, bea);
  await bea.client.rpc('create_group', { name: 'Other crew' });
  sql(`select private.finalize_periods('2026-10-26T10:00:00Z')`);
  const standings = [await standing(ana), await standing(bea)];
  const seasonStamps = [await stamps(ana), await stamps(bea)];
  const sessions = count('sessions', `user_id in ('${ana.id}','${bea.id}')`);
  expect(standings[0].points).toBeGreaterThan(0);
  expect(sessions).toBe(4);

  await ana.client.rpc('delete_group', { group_id: gymCrew });

  expect([await standing(ana), await standing(bea)]).toEqual(standings);
  expect([await stamps(ana), await stamps(bea)]).toEqual(seasonStamps);
  expect(count('sessions', `user_id in ('${ana.id}','${bea.id}')`)).toBe(sessions);
  expect(await names(bea)).toEqual(['Other crew']);
});

test("a member who isn't the Owner can't delete the Group, and neither can an outsider", async () => {
  const ana = await lifter('Ana');
  const bea = await lifter('Bea');
  const cy = await lifter('Cy');
  const gymCrew = await groupOf(ana, bea);

  for (const someone of [bea, cy]) {
    const refused = await someone.client.rpc('delete_group', { group_id: gymCrew });
    expect(refused.error?.message).toBe('not_owner');
  }

  expect(await names(ana)).toEqual(['Gym crew']);
  expect(await names(bea)).toEqual(['Gym crew']);
});
