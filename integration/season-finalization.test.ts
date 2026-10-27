import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from 'vitest';
import { sql } from './sql.ts';
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

// A Weekly Target of 1, so a week with one Session is a perfect week: 120 Consistency Points.
const weeklyTarget = () => ({
  id: crypto.randomUUID(),
  kind: 'saveProfileEntry',
  entry: { field: 'weeklyTarget', effectiveFrom: '2024-12-30', value: 1, updatedAt: '2024-12-30T12:00:00.000Z' },
});

// One finished Session of six equal squat Sets (a perfect week, no Personal Record), started at 12:00
// UTC, or at 20:00 UTC in Honolulu (UTC-10), on the given local date.
function session(localDate: string, timeZone = 'UTC') {
  const startedAt = `${localDate}T${timeZone === 'UTC' ? '12' : '20'}:00:00.000Z`;
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

// The Mondays of the first 2025 Season (Q1) that a lifter trains on: each is a perfect week.
const MONDAYS = ['01-06', '01-13', '01-20', '01-27', '02-03', '02-10', '02-17', '02-24', '03-03', '03-10', '03-17', '03-24'].map((day) => `2025-${day}`);
const trainOn = (days: string[], timeZone?: string) => days.flatMap((day) => session(day, timeZone));

// Only these tests train in 2025, so the Seasons under test hold only the users made here.
// Q1 ends on 31 March; 72 hours later, in UTC, is 00:00 UTC on 4 April.
const frozenInUtc = '2025-04-04T00:00:00Z';
const frozenInHonolulu = '2025-04-04T10:00:00Z';

const finalizeSeasonsAt = (moment: string) => sql(`select private.finalize_seasons('${moment}')`);

type Stamp = { season: string; tier: string; division: number | null };
async function stamps({ client }: Lifter) {
  const { data, error } = await client.rpc('my_season_stamps');
  expect(error).toBeNull();
  return (data as Stamp[]).map(({ season, tier, division }) => [season, tier, division]);
}

async function seasonPoints({ client }: Lifter, onDate: string) {
  const { data, error } = await client.rpc('season_standing', { on_date: onDate });
  expect(error).toBeNull();
  return (data as { points: number }).points;
}

test('a Season freezes 72 hours after it ends, and the next one starts at the bottom of the Tier below', async () => {
  // Eleven perfect weeks: 1,320 points, Gold V.
  const ana = await lifter('Ana');
  await sync(ana, [weeklyTarget(), ...trainOn(MONDAYS.slice(0, 11))]);

  // During the grace the new Season already starts from where the old one stands now: Silver V.
  expect(await seasonPoints(ana, '2025-04-02')).toBe(800);

  finalizeSeasonsAt('2025-04-03T23:59:00Z');
  expect(await stamps(ana)).toEqual([]);

  finalizeSeasonsAt(frozenInUtc);
  expect(await stamps(ana)).toEqual([['2025-Q1', 'gold', 5]]);
  // Frozen, nothing moves: the new Season starts from the same 800.
  expect(await seasonPoints(ana, '2025-04-02')).toBe(800);

  // A first Session in the new Season adds to the starting points.
  await sync(ana, session('2025-04-07'));
  expect(await seasonPoints(ana, '2025-04-07')).toBe(920);
});

test("a Season ends at midnight in the member's own time zone", async () => {
  const lee = await lifter('Lee');
  await sync(lee, [weeklyTarget(), ...trainOn(MONDAYS.slice(0, 11), 'Pacific/Honolulu')]);

  finalizeSeasonsAt(frozenInUtc);
  expect(await stamps(lee)).toEqual([]);

  finalizeSeasonsAt(frozenInHonolulu);
  expect(await stamps(lee)).toEqual([['2025-Q1', 'gold', 5]]);
});

test('a Session synced within the 72 hours counts toward the final Rank, and one synced after does not change it', async () => {
  // Ten perfect weeks: 1,200 points, Silver I.
  const bea = await lifter('Bea');
  await sync(bea, [weeklyTarget(), ...trainOn(MONDAYS.slice(0, 10))]);

  // An eleventh week, synced after the Season ended but before it froze, lifts her to Gold V.
  await sync(bea, session(MONDAYS[10]));
  finalizeSeasonsAt(frozenInUtc);
  expect(await stamps(bea)).toEqual([['2025-Q1', 'gold', 5]]);
  expect(await seasonPoints(bea, '2025-04-02')).toBe(800);

  // A twelfth, synced after the freeze, still adds to her Points but not to the frozen Season.
  await sync(bea, session(MONDAYS[11]));
  expect(await stamps(bea)).toEqual([['2025-Q1', 'gold', 5]]);
  expect(await seasonPoints(bea, '2025-03-15')).toBe(1320);
  expect(await seasonPoints(bea, '2025-04-02')).toBe(800);
});

test('a Bronze finish starts the next Season in Bronze V, and an idle Season passes the soft reset on', async () => {
  const cy = await lifter('Cy');
  await sync(cy, [weeklyTarget(), ...session(MONDAYS[0])]);
  const dan = await lifter('Dan');
  await sync(dan, [weeklyTarget(), ...trainOn(MONDAYS.slice(0, 11))]);

  finalizeSeasonsAt(frozenInUtc);
  expect(await stamps(cy)).toEqual([['2025-Q1', 'bronze', 5]]);
  expect(await seasonPoints(cy, '2025-04-02')).toBe(0);

  // Dan, at Silver V from the start of Q2, never trains in it: he finishes it at Silver V.
  finalizeSeasonsAt('2025-07-04T00:00:00Z');
  expect(await stamps(dan)).toEqual([['2025-Q2', 'silver', 5], ['2025-Q1', 'gold', 5]]);
  expect(await seasonPoints(dan, '2025-07-02')).toBe(0);
});
