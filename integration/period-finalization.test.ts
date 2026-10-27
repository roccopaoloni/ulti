import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'vitest';
import { sql } from './sql.ts';
import { device, newUser } from './users.ts';

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
  entry: { field: 'weeklyTarget', effectiveFrom: '2026-01-05', value, updatedAt: '2026-01-05T12:00:00.000Z' },
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
const honoluluSession = (localDate: string) => session(`${localDate}T20:00:00.000Z`, 'Pacific/Honolulu', localDate);

// A lifter who has trained, on a Weekly Target of 3 (40 Consistency Points a Session).
async function trained(name: string, ...sessions: unknown[][]) {
  const user = await lifter(name);
  await sync(user, [weeklyTarget(3), ...sessions.flat()]);
  return user;
}

// A Group created by the first lifter, which the others join. Everyone is backdated to have joined
// well before the Periods under test, so the finalizer treats the Group as having existed then.
async function groupOf(owner: Lifter, ...others: Lifter[]) {
  const { data: id } = await owner.client.rpc('create_group', { name: 'Gym crew' });
  const [{ invite_code }] = (await owner.client.rpc('my_groups')).data;
  for (const other of others) await other.client.rpc('join_group', { invite_code });
  sql(`update public.group_members set joined_at = '2026-01-01T00:00:00Z' where group_id = '${id}'`);
  return id as string;
}

// The finalizer, run as it would be at the given moment.
const finalizeAt = (moment: string) => sql(`select private.finalize_periods('${moment}')`);

type Crown = { id: number; group_name: string; period: string; first_day: string; points: number; shared_with: number };
async function crowns({ client }: Lifter) {
  const { data, error } = await client.rpc('my_crowns');
  expect(error).toBeNull();
  return data as Crown[];
}
const kinds = (list: Crown[]) => list.map((crown) => [crown.period, crown.first_day]);

async function board({ client }: Lifter, groupId: string, period: 'week' | 'month' | 'year', onDate: string) {
  const { data, error } = await client.rpc('group_board', { group_id: groupId, period, on_date: onDate });
  expect(error).toBeNull();
  return (data as { members: { position: number; display_name: string; points: number }[] }).members.map(
    ({ position, display_name, points }) => [position, display_name, points],
  );
}

async function seasonPoints({ client }: Lifter, onDate: string) {
  const { data, error } = await client.rpc('season_standing', { on_date: onDate });
  expect(error).toBeNull();
  return (data as { points: number }).points;
}

// The week of Monday 19 to Sunday 25 October 2026 ends, for a member in UTC, at 00:00 UTC on the
// 26th, and for a member in Honolulu (UTC-10) at 10:00 UTC.
const weekEndsInUtc = '2026-10-26T00:00:00Z';
const weekEndsInHonolulu = '2026-10-26T10:00:00Z';

test("a week is frozen once it has ended in every member's time zone, and its winner gets a crown", async () => {
  const ana = await trained('Ana', utcSession('2026-10-19'), utcSession('2026-10-20'));
  const lee = await trained('Lee', honoluluSession('2026-10-21'));
  const gymCrew = await groupOf(ana, lee);

  // Over in Ana's time zone, but still Sunday evening in Lee's.
  finalizeAt(weekEndsInUtc);
  expect(await crowns(ana)).toEqual([]);

  finalizeAt(weekEndsInHonolulu);
  expect(await crowns(ana)).toEqual([
    expect.objectContaining({ group_name: 'Gym crew', period: 'week', first_day: '2026-10-19', points: 80, shared_with: 0 }),
  ]);
  expect(await crowns(lee)).toEqual([]);

  // Running it again freezes nothing twice.
  finalizeAt(weekEndsInHonolulu);
  expect(await crowns(ana)).toHaveLength(1);

  expect(await board(lee, gymCrew, 'week', '2026-10-21')).toEqual([[1, 'Ana', 80], [2, 'Lee', 40]]);
});

test("a Session synced after the freeze leaves the week's board unchanged but counts toward Points", async () => {
  const ana = await trained('Ana', utcSession('2026-10-19'), utcSession('2026-10-20'));
  const bea = await trained('Bea', utcSession('2026-10-21'));
  const gymCrew = await groupOf(ana, bea);
  finalizeAt(weekEndsInHonolulu);
  const pointsBefore = await seasonPoints(bea, '2026-10-22');

  // Bea trained twice more that week with no signal and syncs only now: live, that would win it.
  await sync(bea, [...utcSession('2026-10-22'), ...utcSession('2026-10-23')]);

  expect(await board(bea, gymCrew, 'week', '2026-10-21')).toEqual([[1, 'Ana', 80], [2, 'Bea', 40]]);
  expect(await seasonPoints(bea, '2026-10-22')).toBeGreaterThan(pointsBefore);
  expect(await crowns(ana)).toEqual([expect.objectContaining({ points: 80, shared_with: 0 })]);
  expect(await crowns(bea)).toEqual([]);
});

test('tied winners each get a crown, and a week nobody trained has none', async () => {
  const ana = await trained('Ana', utcSession('2026-10-19'));
  const bea = await trained('Bea', utcSession('2026-10-20'));
  const cy = await trained('Cy', utcSession('2026-10-21'), utcSession('2026-10-22'));
  const dee = await trained('Dee');
  const quiet = await trained('Quiet');
  await groupOf(ana, bea, dee);
  await groupOf(cy);
  await groupOf(quiet);

  finalizeAt(weekEndsInHonolulu);

  expect(await crowns(ana)).toEqual([expect.objectContaining({ points: 40, shared_with: 1 })]);
  expect(await crowns(bea)).toEqual([expect.objectContaining({ points: 40, shared_with: 1 })]);
  expect(await crowns(dee)).toEqual([]);
  expect(await crowns(cy)).toEqual([expect.objectContaining({ points: 80, shared_with: 0 })]);
  expect(await crowns(quiet)).toEqual([]);
});

test('a crown is shown once: seeing it clears it, and the next one stays', async () => {
  const ana = await trained('Ana', utcSession('2026-10-05'), utcSession('2026-10-19'));
  await groupOf(ana);
  finalizeAt(weekEndsInHonolulu);
  finalizeAt('2026-11-01T00:00:00Z');

  const [first, second] = await crowns(ana);
  expect(kinds([first, second])).toEqual([['week', '2026-10-19'], ['month', '2026-10-01']]);

  const seen = await ana.client.rpc('see_crown', { crown_id: first.id });
  expect(seen.error).toBeNull();
  expect(kinds(await crowns(ana))).toEqual([['month', '2026-10-01']]);
});

test('a month and a year are frozen too, and a late Session never changes the year', async () => {
  const ana = await trained('Ana', utcSession('2026-03-02'), utcSession('2026-03-03'));
  const gymCrew = await groupOf(ana);

  // March is over for Ana, who trains in UTC, at 00:00 UTC on 1 April.
  finalizeAt('2026-03-31T23:00:00Z');
  expect(await crowns(ana)).toEqual([]);
  finalizeAt('2026-04-01T00:00:00Z');
  expect(kinds(await crowns(ana))).toEqual([['month', '2026-03-01']]);

  finalizeAt('2027-01-01T00:00:00Z');
  expect(kinds(await crowns(ana))).toEqual([['month', '2026-03-01'], ['year', '2026-01-01']]);

  await sync(ana, utcSession('2026-03-04'));
  expect(await board(ana, gymCrew, 'year', '2026-03-04')).toEqual([[1, 'Ana', 80]]);
});

test('signed-out visitors have no crowns', async () => {
  const { error } = await device().rpc('my_crowns');
  expect(error).not.toBeNull();
});
