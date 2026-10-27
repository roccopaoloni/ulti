import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'vitest';
import { sql } from './sql.ts';
import { newUser } from './users.ts';

type Lifter = { id: string; client: SupabaseClient; signIn: () => Promise<SupabaseClient> };

async function lifter(name: string): Promise<Lifter> {
  const { id, device: client, signIn } = await newUser(name);
  const { error } = await client.from('profiles').upsert({ user_id: id, display_name: name, avatar_color: '#6fb6f7' });
  expect(error).toBeNull();
  return { id, client, signIn };
}

async function sync({ client }: Lifter, mutations: unknown[]) {
  const { error } = await client.functions.invoke('sync', { body: { mutations } });
  expect(error).toBeNull();
}

const entry = (field: string, value: unknown) => ({
  id: crypto.randomUUID(),
  kind: 'saveProfileEntry',
  entry: { field, effectiveFrom: '2026-01-05', value, updatedAt: '2026-01-05T12:00:00.000Z' },
});

// One finished Session of six equal squat Sets, started at noon UTC on the given date.
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

// A lifter with one of everything a user can own: Sessions and Sets (so Scoring Events), a Weekly
// Target, sex and bodyweight histories, a Routine, a Custom Exercise, an Increment override and a
// Deload Week.
async function fullLifter(name: string, ...dates: string[]) {
  const user = await lifter(name);
  await sync(user, [
    entry('weeklyTarget', 3),
    entry('sex', 'female'),
    entry('bodyweightKg', 62.5),
    ...dates.flatMap(session),
    { id: crypto.randomUUID(), kind: 'saveRoutine', routine: { id: crypto.randomUUID(), days: [], updatedAt: '2026-10-20T10:00:00.000Z' } },
    { id: crypto.randomUUID(), kind: 'saveExercise', exercise: { id: `custom-${crypto.randomUUID()}`, name: 'Zercher squat' } },
    { id: crypto.randomUUID(), kind: 'saveIncrement', increment: { exerciseId: 'bench-press', incrementKg: 1, updatedAt: '2026-10-20T10:00:00.000Z' } },
    { id: crypto.randomUUID(), kind: 'saveDeload', deload: { week: '2026-10-12', origin: 'self', status: 'accepted', updatedAt: '2026-10-12T10:00:00.000Z' } },
  ]);
  return user;
}

// A Group created by the first lifter, which the others join, backdated so the finalizer treats it
// as existing before the Periods under test.
async function groupOf(owner: Lifter, ...others: Lifter[]) {
  const { data: id } = await owner.client.rpc('create_group', { name: 'Gym crew' });
  const invite_code = sql(`select invite_code from public.groups where id = '${id}'`);
  for (const other of others) await other.client.rpc('join_group', { invite_code });
  sql(`update public.group_members set joined_at = '2026-01-01T00:00:00Z' where group_id = '${id}'`);
  return id as string;
}

async function deleteAccount({ client }: Lifter) {
  const { error } = await client.rpc('delete_account');
  expect(error).toBeNull();
}

type BoardMember = { position: number; display_name: string; avatar_color: string; former?: boolean; points: number };
async function board({ client }: Lifter, groupId: string, period: 'week' | 'month' | 'year', onDate: string) {
  const { data, error } = await client.rpc('group_board', { group_id: groupId, period, on_date: onDate });
  expect(error).toBeNull();
  return (data as { members: BoardMember[] }).members;
}

// Every table with a user_id or owner_id column, and which of them hold rows for the user.
function rowsHeldFor(userId: string) {
  const columns = sql(
    `select c.table_schema || '.' || c.table_name || '.' || c.column_name from information_schema.columns c
     join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
     where c.table_schema in ('public', 'private') and c.column_name in ('user_id', 'owner_id')`,
  )
    .split('\n')
    .filter(Boolean);
  const held = columns.filter((path) => {
    const [schema, table, column] = path.split('.');
    return Number(sql(`select count(*) from ${schema}.${table} where ${column} = '${userId}'`)) > 0;
  });
  return { tables: columns.length, held };
}

const weekEndsInUtc = '2026-10-26T00:00:00Z';
const freeze = (moment: string) => sql(`select private.finalize_periods('${moment}')`);

test('deleting the account erases the user and every row of their data', async () => {
  const ana = await fullLifter('Ana', '2026-10-19', '2026-10-20');
  const lee = await fullLifter('Lee', '2026-10-21');
  await groupOf(ana, lee);
  freeze(weekEndsInUtc);
  const [crown] = (await ana.client.rpc('my_crowns')).data;
  await ana.client.rpc('see_crown', { crown_id: crown.id });

  const before = rowsHeldFor(ana.id);
  expect(before.tables).toBeGreaterThan(8);
  expect(before.held.length).toBeGreaterThan(8);
  const leeBefore = rowsHeldFor(lee.id).held;

  await deleteAccount(ana);

  expect(rowsHeldFor(ana.id).held).toEqual([]);
  expect(sql(`select count(*) from auth.users where id = '${ana.id}'`)).toBe('0');
  // Nobody else's data is touched.
  expect(rowsHeldFor(lee.id).held).toEqual(leeBefore);
});

test("after deleting, the user can't sign in again", async () => {
  const ana = await lifter('Ana');
  await deleteAccount(ana);

  await expect(ana.signIn()).rejects.toThrow();
});

test('a frozen week keeps its places and points, shows the deleted member as a former member and keeps no name or colour', async () => {
  const ana = await fullLifter('Ana', '2026-10-19', '2026-10-20');
  const lee = await fullLifter('Lee', '2026-10-21');
  const gymCrew = await groupOf(ana, lee);
  freeze(weekEndsInUtc);

  await deleteAccount(ana);

  expect(await board(lee, gymCrew, 'week', '2026-10-21')).toEqual([
    expect.objectContaining({ position: 1, display_name: '', avatar_color: '', former: true, points: 80 }),
    expect.objectContaining({ position: 2, display_name: 'Lee', former: false, points: 40 }),
  ]);
  expect(sql(`select count(*) from public.period_results where user_id = '${ana.id}' or display_name = 'Ana'`)).toBe('0');
  // The place stays taken: nobody else inherits the crown.
  expect((await lee.client.rpc('my_crowns')).data).toEqual([]);
});

test('a live board drops the deleted member', async () => {
  const ana = await fullLifter('Ana', '2026-10-19');
  const lee = await fullLifter('Lee', '2026-10-20');
  const gymCrew = await groupOf(ana, lee);

  await deleteAccount(ana);

  expect((await board(lee, gymCrew, 'week', '2026-10-21')).map(({ display_name }) => display_name)).toEqual(['Lee']);
});

test('their Groups hand over ownership, or are deleted when empty', async () => {
  const ana = await lifter('Ana');
  const lee = await lifter('Lee');
  const shared = await groupOf(ana, lee);
  const alone = await groupOf(ana);

  await deleteAccount(ana);

  const { data: groups } = await lee.client.rpc('my_groups');
  expect(groups).toEqual([
    expect.objectContaining({ id: shared, members: [expect.objectContaining({ display_name: 'Lee', owner: true, me: true })] }),
  ]);
  expect(sql(`select count(*) from public.groups where id = '${alone}'`)).toBe('0');
});
