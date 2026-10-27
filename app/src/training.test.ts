import 'fake-indexeddb/auto';
import { expect, test, vi } from 'vitest';
import { openTraining, type Mutation } from './training.ts';

// The sync endpoint, as the phone sees it. Offline, every request fails before it leaves the phone.
function server() {
  const state = { offline: false, failuresLeft: 0, batches: [] as Mutation[][] };
  const send = async (mutations: Mutation[]) => {
    if (state.offline) throw new TypeError('Failed to fetch');
    state.batches.push(mutations);
    if (state.failuresLeft > 0) {
      state.failuresLeft--;
      throw new Error('503 Service Unavailable');
    }
    return { rejected: [] };
  };
  return Object.assign(state, { send });
}

// Ana's phone, in Buenos Aires: each test gets its own user, so its own IndexedDB store. Its clock
// reads a minute later every time, from Monday 19 October 2026, 18:05 in Buenos Aires.
function anasPhone(
  network: ReturnType<typeof server>,
  { retryAfterMs = 60_000, startsAt = Date.UTC(2026, 9, 19, 21, 5) } = {},
) {
  const connectivity = new EventTarget();
  const userId = crypto.randomUUID();
  let minutes = 0;
  // Opening the phone `at` a later moment keeps its data and moves its clock there.
  let clockAt = startsAt;
  const options = {
    send: network.send,
    connectivity,
    now: () => new Date(clockAt + 60_000 * minutes++),
    timeZone: () => 'America/Argentina/Buenos_Aires',
    retryAfterMs,
  };
  return {
    connectivity,
    open: (at = startsAt) => {
      clockAt = at;
      return openTraining(userId, options);
    },
  };
}

const profileEntries = (batch: Mutation[]) =>
  batch.flatMap((m) => (m.kind === 'saveProfileEntry' ? [{ field: m.entry.field, effectiveFrom: m.entry.effectiveFrom, value: m.entry.value }] : []));

const kindsAndValues = (batch: Mutation[]) =>
  batch.map((m) =>
    m.kind === 'saveSession'
      ? { kind: m.kind, finished: m.session.finishedAt !== null }
      : m.kind === 'saveSet'
        ? { kind: m.kind, exerciseId: m.set.exerciseId, weightKg: m.set.weightKg, reps: m.set.reps }
        : m.kind === 'saveProfileEntry' || m.kind === 'saveRoutine' || m.kind === 'saveIncrement' || m.kind === 'saveDeload'
          ? { kind: m.kind }
          : { kind: m.kind, exerciseId: m.exercise.id },
  );

test('Sets logged offline are queued and sent when the phone is back online', async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const training = await phone.open();

  const session = await training.startSession();
  await training.logSet(session.id, 'back-squat', 100, 5);
  await training.logSet(session.id, 'back-squat', 102.5, 4);
  await training.finishSession(session.id);
  expect(network.batches).toEqual([]);

  network.offline = false;
  phone.connectivity.dispatchEvent(new Event('online'));

  await vi.waitFor(() => expect(network.batches).toHaveLength(1));
  expect(kindsAndValues(network.batches[0])).toEqual([
    { kind: 'saveSession', finished: false },
    { kind: 'saveSet', exerciseId: 'back-squat', weightKg: 100, reps: 5 },
    { kind: 'saveSet', exerciseId: 'back-squat', weightKg: 102.5, reps: 4 },
    { kind: 'saveSession', finished: true },
  ]);
  training.close();
});

test('a Session keeps its UTC moment, the time zone and the local date there, even late at night', async () => {
  const network = server();
  // 23:30 on Monday 19 October in Buenos Aires (UTC−3) is already Tuesday in UTC.
  const phone = anasPhone(network, { startsAt: Date.UTC(2026, 9, 20, 2, 30) });
  const training = await phone.open();

  await training.startSession();

  await vi.waitFor(() => expect(network.batches).toHaveLength(1));
  const [start] = network.batches[0];
  expect(start.kind === 'saveSession' && start.session).toMatchObject({
    startedAt: '2026-10-20T02:30:00.000Z',
    timeZone: 'America/Argentina/Buenos_Aires',
    localDate: '2026-10-19',
  });
  training.close();
});

test('every retry resends the same mutation IDs, until the server has them', async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network, { retryAfterMs: 5 });
  const training = await phone.open();
  const session = await training.startSession();
  await training.logSet(session.id, 'bench-press', 80, 8);
  await training.finishSession(session.id);

  // Back online, the server fails twice before it takes the batch.
  network.failuresLeft = 2;
  network.offline = false;
  phone.connectivity.dispatchEvent(new Event('online'));

  await vi.waitFor(() => expect(network.batches).toHaveLength(3));
  const ids = network.batches.map((batch) => batch.map((mutation) => mutation.id));
  expect(ids[1]).toEqual(ids[0]);
  expect(ids[2]).toEqual(ids[0]);
  expect(ids[0]).toHaveLength(3);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(network.batches).toHaveLength(3);
  training.close();
});

test('queued mutations, and the Session in progress, survive the app closing before it syncs', async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const before = await phone.open();
  const session = await before.startSession();
  await before.addExercise(session.id, 'deadlift');
  const set = await before.logSet(session.id, 'deadlift', 140, 3);
  await before.addExercise(session.id, 'pendlay-row');
  before.close();

  network.offline = false;
  const after = await phone.open();

  await vi.waitFor(() => expect(network.batches).toHaveLength(1));
  expect(kindsAndValues(network.batches[0])).toEqual([
    { kind: 'saveSession', finished: false },
    { kind: 'saveSet', exerciseId: 'deadlift', weightKg: 140, reps: 3 },
  ]);
  expect(await after.sessionInProgress()).toEqual({ session, exerciseIds: ['deadlift', 'pendlay-row'], plan: [], sets: [set] });
  after.close();
});

test('a past Set edited offline shows its new weight and reps, and goes out as a later write of the same Set', async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const training = await phone.open();
  const session = await training.startSession();
  const set = await training.logSet(session.id, 'back-squat', 100, 5);
  await training.finishSession(session.id);

  await training.editSet(set.id, 120, 4);

  const [past] = await training.pastSessions();
  expect(past.sets.map(({ id, weightKg, reps }) => ({ id, weightKg, reps }))).toEqual([{ id: set.id, weightKg: 120, reps: 4 }]);
  network.offline = false;
  phone.connectivity.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(network.batches).toHaveLength(1));
  const edits = network.batches[0].flatMap((m) => (m.kind === 'saveSet' ? [m.set] : []));
  expect(edits.map(({ id, weightKg, reps }) => ({ id, weightKg, reps }))).toEqual([
    { id: set.id, weightKg: 100, reps: 5 },
    { id: set.id, weightKg: 120, reps: 4 },
  ]);
  expect(Date.parse(edits[1].updatedAt)).toBeGreaterThan(Date.parse(edits[0].updatedAt));
  training.close();
});

test('a deleted Set disappears from the history and is sent as a deletion', async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const training = await phone.open();
  const session = await training.startSession();
  const typo = await training.logSet(session.id, 'back-squat', 1000, 5);
  const kept = await training.logSet(session.id, 'back-squat', 100, 5);
  await training.finishSession(session.id);

  await training.deleteSet(typo.id);

  const [past] = await training.pastSessions();
  expect(past.sets.map(({ id }) => id)).toEqual([kept.id]);
  network.offline = false;
  phone.connectivity.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(network.batches).toHaveLength(1));
  const last = network.batches[0].at(-1)!;
  expect(last.kind === 'saveSet' && { id: last.set.id, deleted: last.set.deleted }).toEqual({ id: typo.id, deleted: true });
  training.close();
});

test('past Sessions list newest first, and leave out the one in progress', async () => {
  const network = server();
  const phone = anasPhone(network);
  const training = await phone.open();
  const monday = await training.startSession();
  await training.finishSession(monday.id);
  const tuesday = await training.startSession();
  await training.finishSession(tuesday.id);
  const wednesday = await training.startSession();

  expect((await training.pastSessions()).map(({ session }) => session.id)).toEqual([tuesday.id, monday.id]);
  expect(wednesday.finishedAt).toBeNull();
  training.close();
});

test("an Exercise's Sets from the last Session that had it come back in the order they were logged, ready to pre-fill the next one", async () => {
  const phone = anasPhone(server());
  const training = await phone.open();
  const monday = await training.startSession();
  await training.logSet(monday.id, 'back-squat', 100, 5);
  await training.logSet(monday.id, 'bench-press', 80, 8);
  await training.finishSession(monday.id);
  const wednesday = await training.startSession();
  await training.logSet(wednesday.id, 'back-squat', 100, 5);
  await training.logSet(wednesday.id, 'back-squat', 102.5, 4);
  await training.finishSession(wednesday.id);
  const friday = await training.startSession();
  await training.logSet(friday.id, 'back-squat', 105, 3);

  const lastSquats = await training.lastSets('back-squat');

  // Wednesday's, not Monday's, and not the Session in progress.
  expect(lastSquats.map(({ weightKg, reps }) => ({ weightKg, reps }))).toEqual([
    { weightKg: 100, reps: 5 },
    { weightKg: 102.5, reps: 4 },
  ]);
  // Bench press was last on Monday, two Sessions before this one.
  expect((await training.lastSets('bench-press')).map(({ weightKg }) => weightKg)).toEqual([80]);
  expect(await training.lastSets('deadlift')).toEqual([]);
  training.close();
});

test('a Custom Exercise created offline is pickable at once, survives a catalog refresh, and syncs before the Sets that use it', async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const training = await phone.open();

  const plank = await training.createExercise('Weighted plank');
  const session = await training.startSession();
  await training.logSet(session.id, plank.id, 10, 1);
  // The catalog comes back from the server without it, as it has not arrived there yet.
  await training.saveExercises([{ id: 'back-squat', nameEn: 'Back squat', nameEs: 'Sentadilla', equipment: 'barbell', custom: false, incrementKg: 5, bodyweight: false }]);

  expect(await training.exercises()).toEqual(
    expect.arrayContaining([
      { id: plank.id, nameEn: 'Weighted plank', nameEs: 'Weighted plank', equipment: null, custom: true, incrementKg: 2.5, bodyweight: false },
      expect.objectContaining({ id: 'back-squat', custom: false }),
    ]),
  );
  network.offline = false;
  phone.connectivity.dispatchEvent(new Event('online'));

  await vi.waitFor(() => expect(network.batches).toHaveLength(1));
  const [saved, , set] = network.batches[0];
  expect(saved).toMatchObject({ kind: 'saveExercise', exercise: { id: plank.id, name: 'Weighted plank' } });
  expect(plank.id).toMatch(/^custom-[0-9a-f-]{36}$/);
  expect(set).toMatchObject({ kind: 'saveSet', set: { exerciseId: plank.id, weightKg: 10, reps: 1 } });
  training.close();
});

test("a Set's label flipped offline shows at once and goes out as a later write of the same Set, which a retry resends unchanged", async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const training = await phone.open();
  const session = await training.startSession();
  const set = await training.logSet(session.id, 'back-squat', 60, 5);

  await training.setLabel(set.id, 'working');

  const inProgress = await training.sessionInProgress();
  expect(inProgress?.sets.map(({ id, label }) => ({ id, label }))).toEqual([{ id: set.id, label: 'working' }]);
  network.offline = false;
  phone.connectivity.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(network.batches).toHaveLength(1));
  const writes = network.batches[0].flatMap((m) => (m.kind === 'saveSet' ? [{ mutation: m.id, ...m.set }] : []));
  expect(writes.map(({ id, label }) => ({ id, label }))).toEqual([
    { id: set.id, label: undefined },
    { id: set.id, label: 'working' },
  ]);
  expect(Date.parse(writes[1].updatedAt)).toBeGreaterThan(Date.parse(writes[0].updatedAt));
  expect(writes[0].mutation).not.toBe(writes[1].mutation);
  training.close();
});

test("Ana's onboarding is written through the outbox, and her first Weekly Target applies from today", async () => {
  const network = server();
  // Saturday 24 October in Buenos Aires.
  const phone = anasPhone(network, { startsAt: Date.UTC(2026, 9, 24, 21, 5) });
  const training = await phone.open();

  await training.setProfile('sex', 'female');
  await training.setProfile('bodyweightKg', 62.5);
  await training.setProfile('weeklyTarget', 4);

  await vi.waitFor(() => expect(network.batches.flatMap(profileEntries)).toHaveLength(3));
  expect(network.batches.flatMap(profileEntries)).toEqual([
    { field: 'sex', effectiveFrom: '2026-10-24', value: 'female' },
    { field: 'bodyweightKg', effectiveFrom: '2026-10-24', value: 62.5 },
    { field: 'weeklyTarget', effectiveFrom: '2026-10-24', value: 4 },
  ]);
  expect(await training.profile()).toEqual({
    sex: [{ effectiveFrom: '2026-10-24', value: 'female' }],
    bodyweightKg: [{ effectiveFrom: '2026-10-24', value: 62.5 }],
    weeklyTarget: [{ effectiveFrom: '2026-10-24', value: 4 }],
  });
  training.close();
});

test('a later change to the Weekly Target starts next Monday', async () => {
  const network = server();
  const phone = anasPhone(network, { startsAt: Date.UTC(2026, 9, 21, 21, 5) });
  const training = await phone.open();
  await training.setProfile('weeklyTarget', 4);
  training.close();

  // Saturday: lowering it now would let her look consistent for the week already running.
  const saturday = await phone.open(Date.UTC(2026, 9, 24, 21, 5));
  await saturday.setProfile('weeklyTarget', 2);

  expect((await saturday.profile()).weeklyTarget).toEqual([
    { effectiveFrom: '2026-10-21', value: 4 },
    { effectiveFrom: '2026-10-26', value: 2 },
  ]);
  saturday.close();
});

test('a profile entry made offline waits in the outbox and survives the app closing', async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const before = await phone.open();
  await before.setProfile('bodyweightKg', 62.5);
  // Let the failed attempt to send finish before the phone comes back online.
  await new Promise((resolve) => setTimeout(resolve, 20));
  before.close();

  network.offline = false;
  const after = await phone.open();

  await vi.waitFor(() => expect(network.batches).toHaveLength(1));
  expect(profileEntries(network.batches[0])).toEqual([{ field: 'bodyweightKg', effectiveFrom: '2026-10-19', value: 62.5 }]);
  expect((await after.profile()).bodyweightKg).toEqual([{ effectiveFrom: '2026-10-19', value: 62.5 }]);
  after.close();
});

test('the phone asks for bodyweight two weeks after the last time, a dismissed prompt counts, and the last value carries forward', async () => {
  const network = server();
  const phone = anasPhone(network);
  const first = await phone.open();
  expect(await first.bodyweightPromptDue()).toBe(false); // onboarding asks first, not the prompt
  await first.setProfile('bodyweightKg', 62.5);
  expect(await first.bodyweightPromptDue()).toBe(false);
  first.close();

  const twoWeeksLater = await phone.open(Date.UTC(2026, 10, 2, 21, 5));
  expect(await twoWeeksLater.bodyweightPromptDue()).toBe(true);
  await twoWeeksLater.dismissBodyweightPrompt();
  expect(await twoWeeksLater.bodyweightPromptDue()).toBe(false);
  expect((await twoWeeksLater.profile()).bodyweightKg).toEqual([{ effectiveFrom: '2026-10-19', value: 62.5 }]);
  twoWeeksLater.close();

  const fourWeeksLater = await phone.open(Date.UTC(2026, 10, 16, 21, 5));
  expect(await fourWeeksLater.bodyweightPromptDue()).toBe(true);
  fourWeeksLater.close();
});

test('a history fetched from the server fills a new phone, without overwriting what it already holds', async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const training = await phone.open();
  await training.setProfile('bodyweightKg', 63);

  await training.saveProfileHistory([
    { field: 'bodyweightKg', effectiveFrom: '2026-10-19', value: 62 },
    { field: 'sex', effectiveFrom: '2026-10-05', value: 'female' },
  ]);

  expect(await training.profile()).toEqual({
    sex: [{ effectiveFrom: '2026-10-05', value: 'female' }],
    bodyweightKg: [{ effectiveFrom: '2026-10-19', value: 63 }],
    weeklyTarget: [],
  });
  training.close();
});

test("a Personal Record's provisional points are weighted by the sex and bodyweight on the phone, as the server will", async () => {
  const network = server();
  network.offline = true;
  const training = await anasPhone(network).open();
  await training.setProfile('sex', 'male');
  await training.setProfile('bodyweightKg', 83);
  const logSession = async (weightKg: number) => {
    const session = await training.startSession();
    await training.logSet(session.id, 'back-squat', weightKg, 6);
    await training.finishSession(session.id);
  };

  await logSession(100);
  await logSession(100);
  await logSession(105);

  // The same worked example as the rules: a 5% gain by a male 83 kg lifter at the 53.9th percentile.
  expect((await training.scoring()).events.map((e) => e.progressPoints)).toEqual([55]);
  training.close();
});

test('a Personal Record is derived on the phone as soon as the Set is logged, offline, and drops out when the Set is deleted', async () => {
  const network = server();
  network.offline = true;
  const training = await anasPhone(network).open();
  const logSession = async (weightKg: number) => {
    const session = await training.startSession();
    const set = await training.logSet(session.id, 'back-squat', weightKg, 6);
    await training.finishSession(session.id);
    return set;
  };

  await logSession(100);
  await logSession(100);
  expect((await training.scoring()).events).toEqual([]);
  const record = await logSession(105);

  const { events, history } = await training.scoring();
  expect(events.map((e) => [e.setId, e.percentGain, e.progressPoints])).toEqual([[record.id, 5, 50]]);
  expect(history.sessions).toHaveLength(3);

  await training.deleteSet(record.id);
  expect((await training.scoring()).events).toEqual([]);
  training.close();
});

const pushDay = { id: 'push', name: 'Push', exercises: [{ exerciseId: 'bench-press', sets: 3, repMin: 8, repMax: 12 }] };
const pullDay = { id: 'pull', name: 'Pull', exercises: [{ exerciseId: 'barbell-row', sets: 4, repMin: 6, repMax: 10 }] };

const routines = (batch: Mutation[]) => batch.flatMap((m) => (m.kind === 'saveRoutine' ? [m.routine] : []));

test('a Routine saved offline shows at once, and editing it later sends the same Routine again as the latest write', async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const training = await phone.open();
  expect(await training.routine()).toBeNull();

  await training.saveRoutine([pushDay]);
  expect((await training.routine())?.days).toEqual([pushDay]);

  await training.saveRoutine([pushDay, pullDay]);
  expect((await training.routine())?.days).toEqual([pushDay, pullDay]);

  await new Promise((resolve) => setTimeout(resolve, 20));
  network.offline = false;
  phone.connectivity.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(network.batches).toHaveLength(1));
  const [created, edited] = routines(network.batches[0]);
  expect(edited.id).toBe(created.id);
  expect(edited.days).toEqual([pushDay, pullDay]);
  expect(edited.updatedAt > created.updatedAt).toBe(true);
  training.close();
});

test('a Session started from a Routine Day sets up its Exercises with their Sets and Rep Range, and an unplanned one starts empty', async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const training = await phone.open();
  await training.saveRoutine([pushDay, pullDay]);

  const planned = await training.startSession('pull');
  expect(await training.sessionInProgress()).toMatchObject({
    session: { id: planned.id, routineDayId: 'pull' },
    exerciseIds: ['barbell-row'],
    plan: [{ exerciseId: 'barbell-row', sets: 4, repMin: 6, repMax: 10 }],
  });
  await training.finishSession(planned.id);

  const unplanned = await training.startSession();
  expect(await training.sessionInProgress()).toMatchObject({ session: { id: unplanned.id }, exerciseIds: [], plan: [] });
  expect((await training.sessionInProgress())!.session.routineDayId).toBeUndefined();
  training.close();
});

test('the next Session suggested is the Routine Day after the last one started from the Routine', async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const training = await phone.open();
  expect(await training.nextRoutineDay()).toBeNull();

  await training.saveRoutine([pushDay, pullDay]);
  expect((await training.nextRoutineDay())?.id).toBe('push');

  const push = await training.startSession('push');
  await training.finishSession(push.id);
  expect((await training.nextRoutineDay())?.id).toBe('pull');

  // An unplanned Session in between changes nothing.
  const unplanned = await training.startSession();
  await training.finishSession(unplanned.id);
  expect((await training.nextRoutineDay())?.id).toBe('pull');

  const pull = await training.startSession('pull');
  await training.finishSession(pull.id);
  expect((await training.nextRoutineDay())?.id).toBe('push');
  training.close();
});

test("a Routine fetched from the server fills a new phone, but never replaces a later edit the phone made", async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const training = await phone.open();
  const fetched = { id: 'r1', days: [pushDay], updatedAt: '2026-10-01T00:00:00.000Z' };

  await training.saveRoutineFromServer(fetched);
  expect(await training.routine()).toEqual(fetched);

  await training.saveRoutine([pushDay, pullDay]);
  await training.saveRoutineFromServer(fetched);
  expect((await training.routine())?.days).toEqual([pushDay, pullDay]);
  training.close();
});

test("a week's Consistency Points are derived on the phone as Sessions finish, offline, against the Weekly Target in force", async () => {
  const network = server();
  network.offline = true;
  const training = await anasPhone(network).open();
  await training.setProfile('weeklyTarget', 3);
  const trainSession = async (sets: number) => {
    const session = await training.startSession();
    for (let i = 0; i < sets; i++) await training.logSet(session.id, 'back-squat', 100, 5);
    await training.finishSession(session.id);
  };

  await trainSession(6);
  expect((await training.scoring()).consistency.map((week) => [week.week, week.sessionDates.length, week.consistencyPoints])).toEqual([
    ['2026-10-19', 1, 40],
  ]);
  // Five Sets are not a qualifying Session.
  await trainSession(5);
  await trainSession(6);

  const { consistency } = await training.scoring();
  expect(consistency.map((week) => [week.week, week.weeklyTarget, week.consistencyPoints])).toEqual([['2026-10-19', 3, 80]]);
  training.close();
});

test('a pull-up Set with added weight logs offline, queues as the added weight, and is scored at the phone\'s bodyweight', async () => {
  const network = server();
  network.offline = true;
  const training = await anasPhone(network).open();
  await training.saveExercises([
    { id: 'pull-up', nameEn: 'Pull-up', nameEs: 'Dominadas', equipment: 'bodyweight', custom: false, incrementKg: 2.5, bodyweight: true },
  ]);
  await training.setProfile('bodyweightKg', 80);
  const logSession = async (addedKg: number) => {
    const session = await training.startSession();
    const set = await training.logSet(session.id, 'pull-up', addedKg, 6);
    await training.finishSession(session.id);
    return set;
  };

  await logSession(0);
  await logSession(0);
  const record = await logSession(4);

  // 80 kg × 1.2 = 96, then (80 + 4) kg × 1.2 = 100.8: a 5% gain.
  const { events } = await training.scoring();
  expect(events.map((e) => [e.setId, e.bodyweightKg, e.percentGain, e.progressPoints])).toEqual([[record.id, 80, 5, 50]]);
  training.close();
});

const benchCatalog = [{ id: 'bench-press', nameEn: 'Bench press', nameEs: 'Press banca', equipment: 'barbell', custom: false, incrementKg: 2.5, bodyweight: false }];
const benchRange = { repMin: 8, repMax: 12 };

// Ana finishes a Bench Press Session of the given Sets, as [weightKg, reps, rir?].
async function benchSession(training: Awaited<ReturnType<typeof openTraining>>, sets: [number, number, number?][]) {
  const session = await training.startSession();
  for (const [weightKg, reps, rir] of sets) {
    const set = await training.logSet(session.id, 'bench-press', weightKg, reps);
    if (rir !== undefined) await training.setRir(set.id, rir);
  }
  await training.finishSession(session.id);
}

test("a Set's RIR logged offline shows at once and goes out as a later write of the same Set", async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const training = await phone.open();
  const session = await training.startSession();
  const set = await training.logSet(session.id, 'bench-press', 60, 12);

  await training.setRir(set.id, 2);

  expect((await training.sessionInProgress())?.sets.map(({ id, rir }) => ({ id, rir }))).toEqual([{ id: set.id, rir: 2 }]);
  network.offline = false;
  phone.connectivity.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(network.batches).toHaveLength(1));
  const writes = network.batches[0].flatMap((m) => (m.kind === 'saveSet' ? [m.set] : []));
  expect(writes.map(({ id, rir }) => ({ id, rir }))).toEqual([
    { id: set.id, rir: undefined },
    { id: set.id, rir: 2 },
  ]);
  training.close();
});

test('after a Session with every Working Set at the top of the Rep Range, the next Session is recommended the Increment heavier', async () => {
  const network = server();
  network.offline = true;
  const training = await anasPhone(network).open();
  await training.saveExercises(benchCatalog);
  expect(await training.recommendation('bench-press', benchRange)).toBeUndefined();

  await benchSession(training, [[60, 12], [60, 12], [60, 12]]);
  // The next Session has started and Ana has logged a weaker Set: it doesn't change the advice.
  const next = await training.startSession();
  await training.logSet(next.id, 'bench-press', 60, 9);

  expect(await training.recommendation('bench-press', benchRange)).toEqual({ kind: 'goHeavier', weightKg: 62.5, reps: 8, incrementKg: 2.5 });
  training.close();
});

test('RIR 0 logged on those Sets makes the recommendation wait for one more Session at the top', async () => {
  const network = server();
  network.offline = true;
  const training = await anasPhone(network).open();
  await training.saveExercises(benchCatalog);

  await benchSession(training, [[60, 12, 1], [60, 12, 0], [60, 12, 1]]);
  expect(await training.recommendation('bench-press', benchRange)).toBeUndefined();

  await benchSession(training, [[60, 12], [60, 12], [60, 12]]);
  expect(await training.recommendation('bench-press', benchRange)).toEqual({ kind: 'goHeavier', weightKg: 62.5, reps: 8, incrementKg: 2.5 });
  training.close();
});

test("Ana's Increment override changes the recommendation and the keypad step, survives a catalog refresh, and syncs", async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const training = await phone.open();
  await training.saveExercises(benchCatalog);
  await benchSession(training, [[60, 12], [60, 12], [60, 12]]);

  await training.setIncrement('bench-press', 1.25);
  await training.saveExercises(benchCatalog);

  expect(await training.recommendation('bench-press', benchRange)).toEqual({ kind: 'goHeavier', weightKg: 61.25, reps: 8, incrementKg: 1.25 });
  expect((await training.exercises()).find(({ id }) => id === 'bench-press')?.incrementKg).toBe(1.25);
  network.offline = false;
  phone.connectivity.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(network.batches).toHaveLength(1));
  const overrides = network.batches[0].flatMap((m) => (m.kind === 'saveIncrement' ? [m.increment] : []));
  expect(overrides).toMatchObject([{ exerciseId: 'bench-press', incrementKg: 1.25 }]);
  training.close();
});

test('an override fetched from the server fills a new phone, but never replaces a later one the phone made', async () => {
  const network = server();
  network.offline = true;
  const training = await anasPhone(network).open();
  await training.saveExercises(benchCatalog);

  await training.saveIncrementsFromServer([{ exerciseId: 'bench-press', incrementKg: 5, updatedAt: '2026-10-01T00:00:00.000Z' }]);
  expect((await training.exercises())[0].incrementKg).toBe(5);

  await training.setIncrement('bench-press', 1.25);
  await training.saveIncrementsFromServer([{ exerciseId: 'bench-press', incrementKg: 5, updatedAt: '2026-10-01T00:00:00.000Z' }]);
  expect((await training.exercises())[0].incrementKg).toBe(1.25);
  training.close();
});

test('a Custom Exercise at the top of the Rep Range gets no recommendation', async () => {
  const network = server();
  network.offline = true;
  const training = await anasPhone(network).open();
  const dip = await training.createExercise('Assisted dip');
  const session = await training.startSession();
  for (let i = 0; i < 3; i++) await training.logSet(session.id, dip.id, 20, 12);
  await training.finishSession(session.id);

  expect(await training.recommendation(dip.id, benchRange)).toBeUndefined();
  training.close();
});

test('two Sessions under the bottom of the Rep Range recommend a Stall reset, judged without the Session in progress', async () => {
  const network = server();
  network.offline = true;
  const training = await anasPhone(network).open();
  await training.saveExercises(benchCatalog);
  await benchSession(training, [[60, 7], [60, 6]]);
  expect(await training.recommendation('bench-press', benchRange)).toBeUndefined();

  await benchSession(training, [[60, 7], [60, 7]]);
  const next = await training.startSession();
  await training.logSet(next.id, 'bench-press', 60, 12);

  expect(await training.recommendation('bench-press', benchRange)).toEqual({ kind: 'stall', weightKg: 55, reps: 8 });
  training.close();
});

test('a Custom Exercise never gets a Stall', async () => {
  const network = server();
  network.offline = true;
  const training = await anasPhone(network).open();
  const dip = await training.createExercise('Assisted dip');
  for (let i = 0; i < 2; i++) {
    const session = await training.startSession();
    await training.logSet(session.id, dip.id, 20, 3);
    await training.finishSession(session.id);
  }

  expect(await training.recommendation(dip.id, benchRange)).toBeUndefined();
  training.close();
});

test('a Deload Week started offline is stored and synced, and its Sessions then qualify with three Working Sets', async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const training = await phone.open();
  await training.setProfile('weeklyTarget', 2);
  expect((await training.deload()).active).toBe(false);

  expect(await training.startDeload()).toBe(true);
  expect((await training.deload()).active).toBe(true);
  await benchSession(training, [[50, 10], [50, 10], [50, 10]]);
  expect((await training.scoring()).consistency.map((week) => week.sessionDates)).toEqual([['2026-10-19']]);

  network.offline = false;
  phone.connectivity.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(network.batches).toHaveLength(1));
  const deloads = network.batches[0].flatMap((m) => (m.kind === 'saveDeload' ? [m.deload] : []));
  expect(deloads).toEqual([{ week: '2026-10-19', origin: 'self', status: 'accepted', updatedAt: expect.any(String) }]);
  training.close();
});

test('a lifter can start a Deload Week at most once every four weeks', async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const training = await phone.open();
  expect(await training.startDeload()).toBe(true);
  expect(await training.startDeload()).toBe(false);
  training.close();

  // Three weeks on is too soon; four weeks on is allowed.
  const soon = await phone.open(Date.UTC(2026, 10, 9, 21, 5));
  expect(await soon.startDeload()).toBe(false);
  soon.close();
  const later = await phone.open(Date.UTC(2026, 10, 16, 21, 5));
  expect((await later.deload()).canStart).toBe(true);
  expect(await later.startDeload()).toBe(true);
  later.close();
});

test('a suggested Deload Week can be dismissed or accepted, both are stored, and a dismissal keeps it quiet for four weeks', async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const first = await phone.open();
  await benchSession(first, [[60, 10], [60, 10]]);
  expect((await first.deload()).suggestion).toBeUndefined();
  first.close();

  // Eight weeks after the first Session, the app nudges.
  const nudged = await phone.open(Date.UTC(2026, 11, 14, 21, 5));
  expect((await nudged.deload()).suggestion).toBe('time');
  await nudged.answerDeload(false);
  expect((await nudged.deload()).suggestion).toBeUndefined();
  nudged.close();
  const quiet = await phone.open(Date.UTC(2026, 11, 21, 21, 5));
  expect((await quiet.deload()).suggestion).toBeUndefined();
  quiet.close();

  const again = await phone.open(Date.UTC(2027, 0, 11, 21, 5));
  expect((await again.deload()).suggestion).toBe('time');
  await again.answerDeload(true);
  expect(await again.deload()).toMatchObject({ active: true, suggestion: undefined });

  network.offline = false;
  phone.connectivity.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(network.batches.length).toBeGreaterThan(0));
  const deloads = network.batches.flat().flatMap((m) => (m.kind === 'saveDeload' ? [m.deload] : []));
  expect(deloads.map(({ week, origin, reason, status }) => ({ week, origin, reason, status }))).toEqual([
    { week: '2026-12-14', origin: 'suggested', reason: 'time', status: 'dismissed' },
    { week: '2027-01-11', origin: 'suggested', reason: 'time', status: 'accepted' },
  ]);
  again.close();
});

test('Deload Week Sessions are skipped when the next Session is pre-filled and when it is advised to go heavier', async () => {
  const network = server();
  network.offline = true;
  const phone = anasPhone(network);
  const regular = await phone.open();
  await regular.saveExercises(benchCatalog);
  await benchSession(regular, [[60, 12], [60, 12], [60, 12]]);
  regular.close();

  // The next week is a Deload Week with lighter Sets.
  const deload = await phone.open(Date.UTC(2026, 9, 26, 21, 5));
  expect(await deload.startDeload()).toBe(true);
  await benchSession(deload, [[54, 12], [54, 12]]);
  expect((await deload.lastSets('bench-press')).map((set) => set.weightKg)).toEqual([60, 60, 60]);
  expect(await deload.recommendation('bench-press', benchRange)).toEqual({ kind: 'goHeavier', weightKg: 62.5, reps: 8, incrementKg: 2.5 });
  deload.close();
});

test('the Deload Weeks the server holds reach a phone that is new to this user', async () => {
  const training = await anasPhone(server()).open();
  await training.saveDeloadsFromServer([{ week: '2026-10-19', origin: 'self', status: 'accepted', updatedAt: '2026-10-19T10:00:00.000Z' }]);
  expect((await training.deload()).active).toBe(true);
  training.close();
});
