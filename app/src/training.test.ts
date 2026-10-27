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
  const options = {
    send: network.send,
    connectivity,
    now: () => new Date(startsAt + 60_000 * minutes++),
    timeZone: () => 'America/Argentina/Buenos_Aires',
    retryAfterMs,
  };
  return { connectivity, open: () => openTraining(userId, options) };
}

const kindsAndValues = (batch: Mutation[]) =>
  batch.map((m) =>
    m.kind === 'saveSession'
      ? { kind: m.kind, finished: m.session.finishedAt !== null }
      : m.kind === 'saveSet'
        ? { kind: m.kind, exerciseId: m.set.exerciseId, weightKg: m.set.weightKg, reps: m.set.reps }
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
  expect(await after.sessionInProgress()).toEqual({ session, exerciseIds: ['deadlift', 'pendlay-row'], sets: [set] });
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
  await training.saveExercises([{ id: 'back-squat', nameEn: 'Back squat', nameEs: 'Sentadilla', equipment: 'barbell', custom: false, incrementKg: 5 }]);

  expect(await training.exercises()).toEqual(
    expect.arrayContaining([
      { id: plank.id, nameEn: 'Weighted plank', nameEs: 'Weighted plank', equipment: null, custom: true, incrementKg: 2.5 },
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
