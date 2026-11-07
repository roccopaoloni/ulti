import 'fake-indexeddb/auto';
import { weekStart } from '@ulti/rules';
import { openDB } from 'idb';
import { expect, test } from 'vitest';
import { deleteLeftoverPractice, endPractice, startPractice } from './practice.ts';
import { openTraining, type Mutation } from './training.ts';

// The lifter's own phone, onboarded: a catalog, a profile and a Routine of their own, and a network that
// records what reaches it. Its clock reads Friday 6 November 2026, 18:00 in Buenos Aires, a minute later every time.
async function lifter() {
  const batches: Mutation[][] = [];
  const userId = crypto.randomUUID();
  let minutes = 0;
  const clock = {
    now: () => new Date(Date.UTC(2026, 10, 6, 21, 0) + 60_000 * minutes++),
    timeZone: () => 'America/Argentina/Buenos_Aires',
  };
  const real = await openTraining(userId, {
    send: async (mutations) => {
      batches.push(mutations);
      return { rejected: [] };
    },
    connectivity: new EventTarget(),
    retryAfterMs: 60_000,
    ...clock,
  });
  await real.saveExercises([
    { id: 'bench-press', nameEn: 'Bench press', nameEs: 'Press banca', equipment: 'barbell', custom: false, incrementKg: 2.5, bodyweight: false, muscle: 'chest' },
    { id: 'barbell-row', nameEn: 'Barbell row', nameEs: 'Remo con barra', equipment: 'barbell', custom: false, incrementKg: 2.5, bodyweight: false, muscle: 'back' },
  ]);
  await real.setProfile('sex', 'female');
  await real.setProfile('bodyweightKg', 70);
  await real.setProfile('weeklyTarget', 4);
  await real.saveRoutine([{ id: 'upper', name: 'Upper', exercises: [{ exerciseId: 'bench-press', sets: 3, repMin: 8, repMax: 12 }] }]);
  return { real, userId, batches, clock };
}

// What the lifter's own database holds, counted straight from IndexedDB.
async function stored(userId: string) {
  const db = await openDB(`ulti-${userId}`);
  const counts = { sessions: await db.count('sessions'), sets: await db.count('sets'), outbox: await db.count('outbox'), profile: await db.count('profile') };
  db.close();
  return counts;
}

// The lifter's database and the Practice Session's, whichever exist (other tests' databases share the fake IndexedDB).
const databases = async (userId: string) => (await indexedDB.databases()).map(({ name }) => name).filter((name) => name === 'ulti-practice' || name === `ulti-${userId}`);

test('a Practice Session from start to Finish sends nothing, leaves no database behind and leaves the lifter’s own untouched', async () => {
  const { real, userId, batches, clock } = await lifter();
  const before = await stored(userId);
  const sent = batches.length;

  const practice = await startPractice(real, { dayName: 'Practice day', ...clock });
  const day = (await practice.dayChoices())[0]!;
  expect(day.day.name).toBe('Practice day');
  expect(day.suggested).toBe(true);
  const session = await practice.startSession(day.day.id);
  await practice.logSet(session.id, 'bench-press', 62.5, 8);
  await practice.finishSession(session.id);
  await endPractice(practice);

  expect(batches.length).toBe(sent);
  expect(await stored(userId)).toEqual(before);
  expect(await real.pastSessions()).toEqual([]);
  expect(await databases(userId)).toEqual([`ulti-${userId}`]);
  real.close();
});

test('on the seeded data Bench press recommends going heavier, 62.5 × 6 is not a Personal Record, un-logged and logged as 62.5 × 8 it is, and six Working Sets fill the dot', async () => {
  const { real, clock } = await lifter();
  const practice = await startPractice(real, { dayName: 'Practice day', ...clock });
  const day = (await practice.dayChoices())[0]!.day;
  const bench = day.exercises.find(({ exerciseId }) => exerciseId === 'bench-press')!;
  const row = day.exercises.find(({ exerciseId }) => exerciseId === 'barbell-row')!;
  expect([bench.sets, bench.repMin, bench.repMax, row.sets, row.repMin, row.repMax]).toEqual([3, 6, 8, 3, 8, 10]);

  expect((await practice.lastSets('bench-press')).map(({ weightKg, reps }) => [weightKg, reps])).toEqual([[40, 10], [60, 8], [60, 8], [60, 8]]);
  expect((await practice.lastSets('barbell-row')).map(({ weightKg, reps }) => [weightKg, reps])).toEqual([[50, 10], [50, 10], [50, 10]]);
  expect(await practice.recommendation('bench-press', bench)).toEqual({ kind: 'goHeavier', weightKg: 62.5, reps: 6, incrementKg: 2.5 });
  expect(await practice.recommendation('barbell-row', row)).toBeUndefined();
  expect((await practice.history()).sessions.every(({ localDate }) => localDate < '2026-11-06')).toBe(true);

  // The Tutorial's script: the pre-filled 62.5 × 6 is no Personal Record; un-logging it and logging 62.5 × 8 instead is.
  const session = await practice.startSession(day.id);
  const today = async () => (await practice.scoring()).events.filter(({ localDate }) => localDate === '2026-11-06').map(({ setId }) => setId);
  await practice.logSet(session.id, 'bench-press', 40, 10);
  const prefilled = await practice.logSet(session.id, 'bench-press', 62.5, 6);
  expect(await today()).toEqual([]);
  await practice.deleteSet(prefilled.id);
  const first = await practice.logSet(session.id, 'bench-press', 62.5, 8);
  expect(await today()).toEqual([first.id]);
  await practice.logSet(session.id, 'bench-press', 62.5, 6);
  await practice.logSet(session.id, 'bench-press', 62.5, 6);
  for (let i = 0; i < 3; i++) await practice.logSet(session.id, 'barbell-row', 50, 10);
  expect(await today()).toEqual([first.id]);
  await practice.finishSession(session.id);

  const { consistency } = await practice.scoring();
  const thisWeek = consistency.find((event) => event.week === weekStart('2026-11-06'));
  expect(thisWeek?.sessionDates).toEqual(['2026-11-06']);
  expect(thisWeek?.weeklyTarget).toBe(4);
  await endPractice(practice);
  real.close();
});

test('skipping mid-practice deletes the throwaway data, and a leftover is deleted when the Tutorial starts', async () => {
  const { real, userId, clock } = await lifter();
  const practice = await startPractice(real, { dayName: 'Practice day', ...clock });
  await practice.startSession((await practice.dayChoices())[0]!.day.id);
  expect(await databases(userId)).toHaveLength(2);
  await endPractice(practice);
  expect(await databases(userId)).toEqual([`ulti-${userId}`]);

  // A tab closed mid-practice leaves its database behind; the Tutorial starting again clears it.
  const leftover = await startPractice(real, { dayName: 'Practice day', ...clock });
  leftover.close();
  expect(await databases(userId)).toHaveLength(2);
  await deleteLeftoverPractice();
  expect(await databases(userId)).toEqual([`ulti-${userId}`]);
  real.close();
});
