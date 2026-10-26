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

// Ana's phone, in Buenos Aires: each test gets its own user, so its own IndexedDB store.
function anasPhone(network: ReturnType<typeof server>) {
  const connectivity = new EventTarget();
  const userId = crypto.randomUUID();
  let minutes = 0;
  const options = {
    send: network.send,
    connectivity,
    // Monday 19 October 2026, 18:05 in Buenos Aires, a minute later on every reading.
    now: () => new Date(Date.UTC(2026, 9, 19, 21, 5 + minutes++)),
    timeZone: () => 'America/Argentina/Buenos_Aires',
  };
  return { connectivity, open: () => openTraining(userId, options) };
}

const kindsAndValues = (batch: Mutation[]) =>
  batch.map((m) =>
    m.kind === 'saveSession'
      ? { kind: m.kind, finished: m.session.finishedAt !== null }
      : { kind: m.kind, exerciseId: m.set.exerciseId, weightKg: m.set.weightKg, reps: m.set.reps },
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
