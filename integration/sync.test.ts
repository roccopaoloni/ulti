import type { SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { expect, test, vi } from 'vitest';
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
async function trainingOf({ client }: Lifter) {
  const sessions = await client
    .from('sessions')
    .select('id, started_at, time_zone, local_date, finished_at')
    .order('started_at');
  const sets = await client
    .from('sets')
    .select('id, session_id, exercise_id, weight_kg, reps, logged_at')
    .order('logged_at');
  const scoringEvents = await client.from('scoring_events').select('id');
  expect([sessions.error, sets.error, scoringEvents.error]).toEqual([null, null, null]);
  return { sessions: sessions.data, sets: sets.data, scoringEvents: scoringEvents.data };
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
    // No kind of Scoring Event exists yet.
    scoringEvents: [],
  };
}

test('the catalog holds the 14 Benchmark Lifts, each with its type, the Benchmark Lift flag and a default Increment', async () => {
  const ana = await lifter('ana');

  const { data, error } = await ana.client
    .from('exercises')
    .select('id, name_en, name_es, type, is_benchmark_lift, default_increment_kg')
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

// SQL run straight on the local database, in its container (named after project_id in
// supabase/config.toml), for what no API does: breaking the recompute, and running a scheduled job now.
function sql(statement: string) {
  return execFileSync(
    'docker',
    ['exec', '-e', 'PGPASSWORD=postgres', 'supabase_db_ulti', 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-tAc', statement],
    { encoding: 'utf8' },
  ).trim();
}

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
