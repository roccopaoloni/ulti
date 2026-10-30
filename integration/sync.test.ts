import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test, vi } from 'vitest';
import { scoringEventsOf, sql } from './sql.ts';
import { newUser } from './users.ts';

type Lifter = { id: string; client: SupabaseClient };

// A verified user, signed in on their phone.
async function lifter(name: string): Promise<Lifter> {
  const { id, device } = await newUser(name);
  return { id, client: device };
}

// What the phone's outbox sends: a batch of mutations, each with an ID made on the phone.
async function sync({ client }: Lifter, mutations: unknown[]) {
  const { data, error } = await client.functions.invoke('sync', { body: { mutations } });
  expect(error).toBeNull();
  return data as { rejected: string[] };
}

// Everything the lifter can read back of their own training.
async function trainingOf({ id, client }: Lifter) {
  const sessions = await client
    .from('sessions')
    .select('id, started_at, time_zone, local_date, finished_at')
    .order('started_at');
  const sets = await client
    .from('sets')
    .select('id, session_id, exercise_id, weight_kg, reps, logged_at')
    .eq('deleted', false)
    .order('logged_at');
  expect([sessions.error, sets.error]).toEqual([null, null]);
  return { sessions: sessions.data, sets: sets.data, scoringEvents: scoringEventsOf(id).map(({ id }) => ({ id })) };
}

// Ana's Monday-evening squat Session in Buenos Aires (UTC−3), as her phone records it: she starts
// the Session, logs two Sets and finishes, each write a mutation with its own ID.
function anasMonday() {
  const sessionId = crypto.randomUUID();
  const started = {
    id: sessionId,
    startedAt: '2026-10-19T21:05:00.000Z',
    timeZone: 'America/Argentina/Buenos_Aires',
    localDate: '2026-10-19',
    finishedAt: null,
    updatedAt: '2026-10-19T21:05:00.000Z',
  };
  const set = (loggedAt: string, weightKg: number, reps: number) => ({
    id: crypto.randomUUID(),
    kind: 'saveSet',
    set: { id: crypto.randomUUID(), sessionId, exerciseId: 'back-squat', weightKg, reps, loggedAt, updatedAt: loggedAt },
  });
  return {
    sessionId,
    start: { id: crypto.randomUUID(), kind: 'saveSession', session: started },
    firstSet: set('2026-10-19T21:12:00.000Z', 100, 5),
    secondSet: set('2026-10-19T21:16:30.000Z', 102.5, 4),
    finish: {
      id: crypto.randomUUID(),
      kind: 'saveSession',
      session: { ...started, finishedAt: '2026-10-19T22:10:00.000Z', updatedAt: '2026-10-19T22:10:00.000Z' },
    },
  };
}

// What the server holds once all of Ana's Monday has arrived.
function anasMondayOnTheServer({ sessionId, firstSet, secondSet }: ReturnType<typeof anasMonday>) {
  return {
    sessions: [
      {
        id: sessionId,
        started_at: '2026-10-19T21:05:00+00:00',
        time_zone: 'America/Argentina/Buenos_Aires',
        local_date: '2026-10-19',
        finished_at: '2026-10-19T22:10:00+00:00',
      },
    ],
    sets: [
      {
        id: firstSet.set.id,
        session_id: sessionId,
        exercise_id: 'back-squat',
        weight_kg: 100,
        reps: 5,
        logged_at: '2026-10-19T21:12:00+00:00',
      },
      {
        id: secondSet.set.id,
        session_id: sessionId,
        exercise_id: 'back-squat',
        weight_kg: 102.5,
        reps: 4,
        logged_at: '2026-10-19T21:16:30+00:00',
      },
    ],
    // One Session only sets her baseline, so it earns no Scoring Event.
    scoringEvents: [],
  };
}

test('the catalog holds the 14 Benchmark Lifts, each with its type, the Benchmark Lift flag and a default Increment', async () => {
  const ana = await lifter('ana');

  const { data, error } = await ana.client
    .from('exercises')
    .select('id, name_en, name_es, type, is_benchmark_lift, default_increment_kg')
    .eq('is_benchmark_lift', true)
    .order('id');

  expect(error).toBeNull();
  // Increments by equipment (spec): about +5 kg for barbell lower-body lifts, +2.5 kg for barbell
  // upper-body lifts. Bodyweight lifts add weight in 2.5 kg plates, and the power clean, a fast
  // technical pull, moves up like the upper-body lifts.
  const lift = (id: string, en: string, es: string, type: string, increment: number) => ({
    id,
    name_en: en,
    name_es: es,
    type,
    is_benchmark_lift: true,
    default_increment_kg: increment,
  });
  expect(data).toEqual([
    lift('back-squat', 'Back squat', 'Sentadilla', 'weighted', 5),
    lift('bench-press', 'Bench press', 'Press banca', 'weighted', 2.5),
    lift('chin-up', 'Chin-up', 'Dominadas supinas', 'bodyweight', 2.5),
    lift('deadlift', 'Deadlift', 'Peso muerto', 'weighted', 5),
    lift('dip', 'Dip', 'Fondos en paralelas', 'bodyweight', 2.5),
    lift('front-squat', 'Front squat', 'Sentadilla frontal', 'weighted', 5),
    lift('incline-bench-press', 'Incline bench press', 'Press banca inclinado', 'weighted', 2.5),
    lift('overhead-press', 'Overhead press', 'Press militar', 'weighted', 2.5),
    lift('pendlay-row', 'Pendlay row', 'Remo Pendlay', 'weighted', 2.5),
    lift('power-clean', 'Power clean', 'Cargada de potencia', 'weighted', 2.5),
    lift('pull-up', 'Pull-up', 'Dominadas', 'bodyweight', 2.5),
    lift('push-press', 'Push press', 'Push press', 'weighted', 2.5),
    lift('snatch-press', 'Snatch press', 'Press con agarre de arranque', 'weighted', 2.5),
    lift('sumo-deadlift', 'Sumo deadlift', 'Peso muerto sumo', 'weighted', 5),
  ]);
});

test('the catalog lists each equipment variant as its own Exercise, with a default Increment that fits the equipment', async () => {
  const ana = await lifter('ana');

  const { data, error } = await ana.client
    .from('exercises')
    .select('id, name_en, name_es, type, equipment, default_increment_kg, owner_id');

  expect(error).toBeNull();
  const catalog = new Map(data!.map((exercise) => [exercise.id, exercise]));
  // The 14 Benchmark Lifts plus about 50 common exercises.
  expect(catalog.size).toBeGreaterThanOrEqual(60);
  expect(catalog.size).toBeLessThanOrEqual(75);
  // Every Exercise is named in both languages, has an equipment and belongs to nobody.
  for (const exercise of catalog.values()) {
    expect(exercise).toMatchObject({ name_en: expect.stringMatching(/\S/), name_es: expect.stringMatching(/\S/), owner_id: null });
    expect(['barbell', 'dumbbell', 'machine', 'cable', 'smith', 'bodyweight']).toContain(exercise.equipment);
  }
  // Switching equipment is a different Exercise, never a fake record.
  const bench = ['bench-press', 'dumbbell-bench-press', 'smith-machine-bench-press', 'machine-chest-press'];
  expect(bench.map((id) => catalog.get(id)?.equipment)).toEqual(['barbell', 'dumbbell', 'smith', 'machine']);
  // Increments by equipment (spec): +5 kg barbell lower body, +2.5 kg barbell upper body, the next
  // dumbbell, one plate on a machine stack.
  const increments = ['romanian-deadlift', 'barbell-row', 'dumbbell-bench-press', 'leg-press'].map(
    (id) => catalog.get(id)?.default_increment_kg,
  );
  expect(increments).toEqual([5, 2.5, 2.5, 5]);
  expect(catalog.get('dumbbell-bench-press')).toMatchObject({ name_en: 'Dumbbell bench press', name_es: 'Press banca con mancuernas' });
});

// A Custom Exercise as the phone's outbox sends it. Its ID is made on the phone.
function customExercise(name: string) {
  const exerciseId = `custom-${crypto.randomUUID()}`;
  return {
    id: crypto.randomUUID(),
    kind: 'saveExercise',
    exercise: { id: exerciseId, name },
    exerciseId,
  };
}

test("Ana's Custom Exercise syncs with her Sets, and only she can see it", async () => {
  const ana = await lifter('ana');
  const bea = await lifter('bea');
  const monday = anasMonday();
  const plank = customExercise('Plank with a weight');
  const plankSet = {
    id: crypto.randomUUID(),
    kind: 'saveSet',
    set: { ...monday.firstSet.set, id: crypto.randomUUID(), exerciseId: plank.exerciseId, weightKg: 10, reps: 1 },
  };

  const response = await sync(ana, [monday.start, plank, plankSet, monday.finish]);

  expect(response).toEqual({ rejected: [] });
  const mine = await ana.client.from('exercises').select('id, name_en, name_es, type, owner_id').eq('id', plank.exerciseId);
  expect(mine.data).toEqual([
    { id: plank.exerciseId, name_en: 'Plank with a weight', name_es: 'Plank with a weight', type: 'weighted', owner_id: ana.id },
  ]);
  expect((await trainingOf(ana)).sets?.map(({ exercise_id }) => exercise_id)).toEqual([plank.exerciseId]);
  // Bea's catalog is the shared one, without it.
  const theirs = await bea.client.from('exercises').select('id').eq('id', plank.exerciseId);
  expect(theirs.data).toEqual([]);
  expect((await bea.client.from('exercises').select('id').not('owner_id', 'is', null)).data).toEqual([]);
});

test("a Custom Exercise can't replace a catalog Exercise or someone else's Custom Exercise", async () => {
  const ana = await lifter('ana');
  const bea = await lifter('bea');
  const plank = customExercise('Plank');
  await sync(ana, [plank]);

  const overCatalog = { ...plank, id: crypto.randomUUID(), exercise: { ...plank.exercise, id: 'back-squat', name: 'Fake' } };
  expect(await sync(bea, [overCatalog])).toEqual({ rejected: [overCatalog.id] });
  const overAna = { ...plank, id: crypto.randomUUID(), exercise: { ...plank.exercise, name: 'Bea was here' } };
  await sync(bea, [overAna]);

  const squat = await ana.client.from('exercises').select('name_en').eq('id', 'back-squat');
  expect(squat.data).toEqual([{ name_en: 'Back squat' }]);
  const plankNow = await ana.client.from('exercises').select('name_en, owner_id').eq('id', plank.exerciseId);
  expect(plankNow.data).toEqual([{ name_en: 'Plank', owner_id: ana.id }]);
});

test("Ana's Session reaches the server with its Sets, its UTC timestamp, her time zone and its local date", async () => {
  const ana = await lifter('ana');
  const monday = anasMonday();

  const response = await sync(ana, [monday.start, monday.firstSet, monday.secondSet, monday.finish]);

  expect(response).toEqual({ rejected: [] });
  expect(await trainingOf(ana)).toEqual(anasMondayOnTheServer(monday));
});

test('replaying the same batch changes nothing', async () => {
  const ana = await lifter('ana');
  const monday = anasMonday();
  const batch = [monday.start, monday.firstSet, monday.secondSet, monday.finish];
  await sync(ana, batch);

  // The phone never heard back, so it sends the batch again, twice.
  expect(await sync(ana, batch)).toEqual({ rejected: [] });
  expect(await sync(ana, batch)).toEqual({ rejected: [] });

  expect(await trainingOf(ana)).toEqual(anasMondayOnTheServer(monday));
});

test('a mutation ID the server has already applied is ignored, whatever it carries', async () => {
  const ana = await lifter('ana');
  const monday = anasMonday();
  await sync(ana, [monday.start, monday.firstSet, monday.secondSet, monday.finish]);

  const sameIdOtherWeight = { ...monday.firstSet, set: { ...monday.firstSet.set, weightKg: 140 } };
  await sync(ana, [sameIdOtherWeight]);

  expect(await trainingOf(ana)).toEqual(anasMondayOnTheServer(monday));
});

test('batches arriving out of order end in the same state', async () => {
  // Ana's phone sends her Monday in two batches: the start and first Set, then the second Set and
  // the finish. Each user's IDs are their own, so two users receiving the same two batches in
  // opposite orders show what each order leaves behind.
  const inOrder = await lifter('ana');
  const reversed = await lifter('ana');
  const monday = anasMonday();
  const first = [monday.start, monday.firstSet];
  const second = [monday.secondSet, monday.finish];

  await sync(inOrder, first);
  await sync(inOrder, second);
  await sync(reversed, second);
  await sync(reversed, first);

  expect(await trainingOf(inOrder)).toEqual(anasMondayOnTheServer(monday));
  expect(await trainingOf(reversed)).toEqual(anasMondayOnTheServer(monday));
});

test('a Set dated after the moment the server receives it is rejected, and the rest of the batch is saved', async () => {
  const ana = await lifter('ana');
  const monday = anasMonday();
  const inAnHour = new Date(Date.now() + 60 * 60_000).toISOString();
  const future = {
    id: crypto.randomUUID(),
    kind: 'saveSet',
    set: { ...monday.secondSet.set, id: crypto.randomUUID(), loggedAt: inAnHour, updatedAt: inAnHour },
  };

  const response = await sync(ana, [monday.start, monday.firstSet, monday.secondSet, future, monday.finish]);

  expect(response).toEqual({ rejected: [future.id] });
  expect(await trainingOf(ana)).toEqual(anasMondayOnTheServer(monday));
  // The server decides each mutation ID once: sent again, the rejected one still doesn't land.
  await sync(ana, [future]);
  expect(await trainingOf(ana)).toEqual(anasMondayOnTheServer(monday));
});

test('a Set from a phone whose clock runs a minute fast is kept', async () => {
  const ana = await lifter('ana');
  const monday = anasMonday();
  const aMinuteAhead = new Date(Date.now() + 60_000).toISOString();
  const set = { ...monday.firstSet.set, loggedAt: aMinuteAhead, updatedAt: aMinuteAhead };

  const response = await sync(ana, [monday.start, { ...monday.firstSet, set }]);

  expect(response).toEqual({ rejected: [] });
  const { sets } = await trainingOf(ana);
  expect(sets?.map(({ id }) => id)).toEqual([set.id]);
});

// Ana fixes a typo in her second Set: the same Set, written again with a later updatedAt.
function editsSecondSet(monday: ReturnType<typeof anasMonday>, weightKg: number, reps: number, updatedAt: string) {
  return {
    id: crypto.randomUUID(),
    kind: 'saveSet',
    set: { ...monday.secondSet.set, weightKg, reps, updatedAt },
  };
}

test('an edited Set replaces the old one, replaying the edit changes nothing more, and the recompute reads the edit', async () => {
  const ana = await lifter('ana');
  const monday = anasMonday();
  await sync(ana, [monday.start, monday.firstSet, monday.secondSet, monday.finish]);
  const edit = editsSecondSet(monday, 105, 3, '2026-10-20T12:00:00.000Z');

  await sync(ana, [edit]);
  await sync(ana, [edit]);

  const expected = anasMondayOnTheServer(monday);
  expected.sets[1] = { ...expected.sets[1], weight_kg: 105, reps: 3 };
  expect(await trainingOf(ana)).toEqual(expected);
  // The recompute ran over the edited history and cleared the user's dirty mark.
  expect(sql(`select count(*) from private.dirty_users where user_id = '${ana.id}'`)).toBe('0');
});

test('of two edits to the same Set, the later one wins, whichever arrives first', async () => {
  const ana = await lifter('ana');
  const monday = anasMonday();
  await sync(ana, [monday.start, monday.firstSet, monday.secondSet, monday.finish]);
  const first = editsSecondSet(monday, 105, 3, '2026-10-20T12:00:00.000Z');
  const second = editsSecondSet(monday, 107.5, 2, '2026-10-20T12:05:00.000Z');

  await sync(ana, [second]);
  await sync(ana, [first]);

  const { sets } = await trainingOf(ana);
  expect(sets?.[1]).toMatchObject({ weight_kg: 107.5, reps: 2 });
});

test('a deleted Set is gone, replaying the delete changes nothing, and an older edit arriving late does not bring it back', async () => {
  const ana = await lifter('ana');
  const monday = anasMonday();
  await sync(ana, [monday.start, monday.firstSet, monday.secondSet, monday.finish]);
  const edit = editsSecondSet(monday, 105, 3, '2026-10-20T12:00:00.000Z');
  const deletion = { ...edit, id: crypto.randomUUID(), set: { ...edit.set, deleted: true, updatedAt: '2026-10-20T12:05:00.000Z' } };

  await sync(ana, [deletion]);
  await sync(ana, [deletion]);
  await sync(ana, [edit]);

  const expected = anasMondayOnTheServer(monday);
  expected.sets.pop();
  expect(await trainingOf(ana)).toEqual(expected);
  expect(sql(`select count(*) from private.dirty_users where user_id = '${ana.id}'`)).toBe('0');
});

test("Bea can't read Ana's training or write it, directly or through a sync", async () => {
  const ana = await lifter('ana');
  const bea = await lifter('bea');
  const monday = anasMonday();
  await sync(ana, [monday.start, monday.firstSet, monday.secondSet, monday.finish]);

  expect(await trainingOf(bea)).toEqual({ sessions: [], sets: [], scoringEvents: [] });

  // The tables take no writes from the app: every write goes through the sync endpoint.
  const direct = await bea.client.from('sets').insert({
    user_id: ana.id,
    id: crypto.randomUUID(),
    session_id: monday.sessionId,
    exercise_id: 'back-squat',
    weight_kg: 200,
    reps: 1,
    logged_at: '2026-10-19T21:20:00Z',
  });
  expect(direct.error?.code).toBe('42501');

  // Bea's phone sends a Set with the IDs of Ana's Session and Set: it becomes Bea's, and Ana's stays as it was.
  const copied = { ...monday.firstSet, id: crypto.randomUUID(), set: { ...monday.firstSet.set, weightKg: 200 } };
  await sync(bea, [{ ...monday.start, id: crypto.randomUUID() }, copied]);

  expect(await trainingOf(ana)).toEqual(anasMondayOnTheServer(monday));
});

test('if the recompute fails, the Session is saved anyway, and a scheduled job recomputes it later', { timeout: 60_000 }, async () => {
  const ana = await lifter('ana');
  const monday = anasMonday();
  // A Scoring Event left over from an older version of the rules: a recompute replaces it.
  sql(`insert into public.scoring_events (user_id, id, event) values ('${ana.id}', 'left-over', '{}')`);

  // With nowhere to write its result, the recompute fails.
  sql('alter table public.scoring_events rename to scoring_events_away');
  try {
    expect(await sync(ana, [monday.start, monday.firstSet, monday.secondSet, monday.finish])).toEqual({ rejected: [] });
  } finally {
    sql('alter table public.scoring_events_away rename to scoring_events');
  }
  // Read straight from the database: the API takes a moment to see the table again.
  expect(sql(`select string_agg(id, ',') from public.scoring_events where user_id = '${ana.id}'`)).toBe('left-over');

  // The job retries every five minutes. Run it now rather than wait.
  expect(sql(`select schedule from cron.job where jobname = 'recompute-dirty-users' and active`)).toBe('*/5 * * * *');
  sql(`do $$ begin execute (select command from cron.job where jobname = 'recompute-dirty-users'); end $$`);

  await vi.waitFor(async () => expect(await trainingOf(ana)).toEqual(anasMondayOnTheServer(monday)), {
    timeout: 30_000,
    interval: 500,
  });
});

test("a Set's label override syncs, the later flip wins whichever arrives first, and the recompute runs over it", async () => {
  const ana = await lifter('ana');
  const monday = anasMonday();
  await sync(ana, [monday.start, monday.firstSet, monday.secondSet, monday.finish]);
  const flip = (label: string, updatedAt: string) => ({
    id: crypto.randomUUID(),
    kind: 'saveSet',
    set: { ...monday.firstSet.set, label, updatedAt },
  });
  const toWarmUp = flip('warm-up', '2026-10-20T12:00:00.000Z');
  const backToWorking = flip('working', '2026-10-20T12:05:00.000Z');
  const labels = async () => {
    const { data, error } = await ana.client.from('sets').select('id, label').order('logged_at');
    expect(error).toBeNull();
    return data;
  };

  expect(await labels()).toEqual([
    { id: monday.firstSet.set.id, label: null },
    { id: monday.secondSet.set.id, label: null },
  ]);
  await sync(ana, [backToWorking]);
  await sync(ana, [toWarmUp]);

  expect(await labels()).toEqual([
    { id: monday.firstSet.set.id, label: 'working' },
    { id: monday.secondSet.set.id, label: null },
  ]);
  expect(sql(`select count(*) from private.dirty_users where user_id = '${ana.id}'`)).toBe('0');
});

// A tampered client can send what the database would refuse. The bad item is rejected on its own:
// the rest of the batch is saved, and the phone doesn't send it again.
test('a Custom Exercise whose ID does not start with custom- is rejected, and the rest of the batch is saved', async () => {
  const ana = await lifter('ana');
  const monday = anasMonday();
  const fake = { ...customExercise('Fake'), exercise: { id: 'plank', name: 'Fake' } };

  const response = await sync(ana, [monday.start, fake, monday.firstSet, monday.secondSet, monday.finish]);

  expect(response).toEqual({ rejected: [fake.id] });
  expect(await trainingOf(ana)).toEqual(anasMondayOnTheServer(monday));
  expect((await ana.client.from('exercises').select('id').eq('id', 'plank')).data).toEqual([]);
});

test('a Set with an RIR outside 0-4 is rejected, and the rest of the batch is saved', async () => {
  const ana = await lifter('ana');
  const monday = anasMonday();
  const tooEasy = { id: crypto.randomUUID(), kind: 'saveSet', set: { ...monday.secondSet.set, id: crypto.randomUUID(), rir: 5 } };
  const negative = { id: crypto.randomUUID(), kind: 'saveSet', set: { ...monday.secondSet.set, id: crypto.randomUUID(), rir: -1 } };

  const response = await sync(ana, [monday.start, monday.firstSet, tooEasy, monday.secondSet, negative, monday.finish]);

  expect(response).toEqual({ rejected: [tooEasy.id, negative.id] });
  expect(await trainingOf(ana)).toEqual(anasMondayOnTheServer(monday));
});

test('an Increment of 0 or less is rejected, and the rest of the batch is saved', async () => {
  const ana = await lifter('ana');
  const monday = anasMonday();
  const increment = (incrementKg: number) => ({
    id: crypto.randomUUID(),
    kind: 'saveIncrement',
    increment: { exerciseId: 'back-squat', incrementKg, updatedAt: '2026-10-20T12:00:00.000Z' },
  });
  const zero = increment(0);
  const negative = increment(-2.5);

  const response = await sync(ana, [monday.start, zero, monday.firstSet, negative, monday.secondSet, monday.finish]);

  expect(response).toEqual({ rejected: [zero.id, negative.id] });
  expect(await trainingOf(ana)).toEqual(anasMondayOnTheServer(monday));
  expect((await ana.client.from('increment_overrides').select('exercise_id')).data).toEqual([]);
});
