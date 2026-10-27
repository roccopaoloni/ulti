import { openDB, type DBSchema } from 'idb';

// The user's own training lives on the phone, in IndexedDB, so logging never needs a signal
// (ADR 0003). Every write is also a mutation, with an ID made on the phone, kept in an outbox
// until the sync endpoint has it. The endpoint ignores IDs it has already applied, so sending a
// mutation twice is harmless.

export type SessionRecord = {
  id: string;
  // The moment it started in UTC, the lifter's IANA time zone and the local date there (spec: Time).
  startedAt: string;
  timeZone: string;
  localDate: string;
  finishedAt: string | null;
  // When this phone last changed it: the server keeps the latest write.
  updatedAt: string;
};

export type SetRecord = {
  id: string;
  sessionId: string;
  exerciseId: string;
  weightKg: number;
  reps: number;
  // A deleted Set is sent once more marked deleted, so the server forgets it too.
  deleted?: boolean;
  loggedAt: string;
  updatedAt: string;
};

// An Exercise, as the phone keeps it for picking one offline: from the catalog, or a Custom Exercise
// of this user's (spec: Catalog seed). A Custom Exercise has one name and no equipment.
export type Exercise = {
  id: string;
  nameEn: string;
  nameEs: string;
  equipment: string | null;
  custom: boolean;
  incrementKg: number;
};

export type Mutation =
  | { id: string; kind: 'saveSession'; session: SessionRecord }
  | { id: string; kind: 'saveSet'; set: SetRecord }
  | { id: string; kind: 'saveExercise'; exercise: { id: string; name: string } };

// The sync endpoint: it resolves once the server has the batch, and throws otherwise.
export type Send = (mutations: Mutation[]) => Promise<{ rejected: string[] }>;

type Options = {
  send: Send;
  // Fires 'online' when the phone gets a connection back.
  connectivity: EventTarget;
  now: () => Date;
  timeZone: () => string;
  // How long to wait before trying again after a sync fails.
  retryAfterMs: number;
};

interface Store extends DBSchema {
  sessions: { key: string; value: SessionRecord };
  sets: { key: string; value: SetRecord; indexes: { bySession: string } };
  // Mutations waiting for the server, in the order they were made.
  outbox: { key: number; value: Mutation };
  // The Session in progress, kept here so it survives the app reloading into a new version.
  state: { key: 'sessionInProgress'; value: InProgress };
  // The catalog, as last fetched from the server.
  exercises: { key: string; value: Exercise };
}

// The Session being logged and the Exercises added to it, in order, including any with no Sets yet.
type InProgress = { sessionId: string; exerciseIds: string[] };

export type Training = Awaited<ReturnType<typeof openTraining>>;

export async function openTraining(userId: string, options: Options) {
  const db = await openDB<Store>(`ulti-${userId}`, 1, {
    upgrade(db) {
      db.createObjectStore('sessions', { keyPath: 'id' });
      db.createObjectStore('sets', { keyPath: 'id' }).createIndex('bySession', 'sessionId');
      db.createObjectStore('outbox', { autoIncrement: true });
      db.createObjectStore('state');
      db.createObjectStore('exercises', { keyPath: 'id' });
    },
  });

  // Saves a record and queues its mutation in one transaction, with the Session in progress when
  // it changes: none of them exists without the others.
  async function write(mutation: Mutation, inProgress?: InProgress | null) {
    const tx = db.transaction(['sessions', 'sets', 'exercises', 'outbox', 'state'], 'readwrite');
    if (mutation.kind === 'saveSession') await tx.objectStore('sessions').put(mutation.session);
    else if (mutation.kind === 'saveSet') {
      if (mutation.set.deleted) await tx.objectStore('sets').delete(mutation.set.id);
      else await tx.objectStore('sets').put(mutation.set);
    } else {
      const { id, name } = mutation.exercise;
      await tx.objectStore('exercises').put({ id, nameEn: name, nameEs: name, equipment: null, custom: true, incrementKg: 2.5 });
    }
    await tx.objectStore('outbox').add(mutation);
    if (inProgress) await tx.objectStore('state').put(inProgress, 'sessionInProgress');
    if (inProgress === null) await tx.objectStore('state').delete('sessionInProgress');
    await tx.done;
    sync();
  }

  // One sync at a time. A sync asked for while one runs follows it, so nothing written meanwhile
  // waits. A failed sync tries again later: offline, or while supabase-js waits out a token refresh
  // cooldown after reconnecting, which isn't being signed out.
  let running: Promise<void> | null = null;
  let again = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  function sync() {
    if (closed) return;
    if (running) {
      again = true;
      return;
    }
    clearTimeout(retry);
    running = sendOutbox()
      .catch(() => {
        retry = setTimeout(sync, options.retryAfterMs);
      })
      .finally(() => {
        running = null;
        if (again) {
          again = false;
          sync();
        }
      });
  }

  async function sendOutbox() {
    const tx = db.transaction('outbox');
    const [keys, mutations] = await Promise.all([tx.store.getAllKeys(), tx.store.getAll()]);
    if (mutations.length === 0) return;
    await options.send(mutations);
    await db.delete('outbox', IDBKeyRange.bound(keys[0], keys[keys.length - 1]));
  }

  const onOnline = () => sync();
  options.connectivity.addEventListener('online', onOnline);
  // Whatever an earlier visit left in the outbox goes as soon as the app opens.
  sync();

  const stamp = () => options.now().toISOString();

  return {
    async startSession() {
      const now = options.now();
      const timeZone = options.timeZone();
      const session: SessionRecord = {
        id: crypto.randomUUID(),
        startedAt: now.toISOString(),
        timeZone,
        localDate: localDate(now, timeZone),
        finishedAt: null,
        updatedAt: now.toISOString(),
      };
      await write({ id: crypto.randomUUID(), kind: 'saveSession', session }, { sessionId: session.id, exerciseIds: [] });
      return session;
    },

    // Adds an Exercise to the Session in progress, before its first Set is logged.
    async addExercise(sessionId: string, exerciseId: string) {
      const inProgress = await db.get('state', 'sessionInProgress');
      if (inProgress?.sessionId !== sessionId || inProgress.exerciseIds.includes(exerciseId)) return;
      await db.put('state', { sessionId, exerciseIds: [...inProgress.exerciseIds, exerciseId] }, 'sessionInProgress');
    },

    async logSet(sessionId: string, exerciseId: string, weightKg: number, reps: number) {
      const loggedAt = stamp();
      const set: SetRecord = { id: crypto.randomUUID(), sessionId, exerciseId, weightKg, reps, loggedAt, updatedAt: loggedAt };
      await write({ id: crypto.randomUUID(), kind: 'saveSet', set });
      return set;
    },

    // Fixes a Set's weight and reps: the same Set written again, so the latest write wins.
    async editSet(setId: string, weightKg: number, reps: number) {
      const set = (await db.get('sets', setId))!;
      await write({ id: crypto.randomUUID(), kind: 'saveSet', set: { ...set, weightKg, reps, updatedAt: stamp() } });
    },

    async deleteSet(setId: string) {
      const set = (await db.get('sets', setId))!;
      await write({ id: crypto.randomUUID(), kind: 'saveSet', set: { ...set, deleted: true, updatedAt: stamp() } });
    },

    // The finished Sessions, newest first, each with its Sets in the order they were logged.
    async pastSessions() {
      const finished = (await db.getAll('sessions')).filter((session) => session.finishedAt !== null);
      finished.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      return Promise.all(
        finished.map(async (session) => {
          const sets = await db.getAllFromIndex('sets', 'bySession', session.id);
          sets.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
          return { session, sets };
        }),
      );
    },

    async finishSession(sessionId: string) {
      const session = (await db.get('sessions', sessionId))!;
      const finishedAt = stamp();
      await write({ id: crypto.randomUUID(), kind: 'saveSession', session: { ...session, finishedAt, updatedAt: finishedAt } }, null);
    },

    // The Session being logged, with its Exercises and their Sets in the order they were logged.
    async sessionInProgress() {
      const inProgress = await db.get('state', 'sessionInProgress');
      if (!inProgress) return null;
      const session = (await db.get('sessions', inProgress.sessionId))!;
      const sets = await db.getAllFromIndex('sets', 'bySession', inProgress.sessionId);
      sets.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
      return { session, exerciseIds: inProgress.exerciseIds, sets };
    },

    // The Exercise's Sets from the last Session that had it, other than the one in progress: what
    // the next Session's rows are pre-filled with.
    async lastSets(exerciseId: string) {
      const inProgress = await db.get('state', 'sessionInProgress');
      const sets = (await db.getAll('sets')).filter((set) => set.exerciseId === exerciseId && set.sessionId !== inProgress?.sessionId);
      if (sets.length === 0) return [];
      const sessions = await Promise.all([...new Set(sets.map((set) => set.sessionId))].map((id) => db.get('sessions', id)));
      const last = sessions.reduce((a, b) => (a!.startedAt > b!.startedAt ? a : b))!;
      return sets.filter((set) => set.sessionId === last.id).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
    },

    exercises: () => db.getAll('exercises'),

    // Exercises are never removed, so the refresh adds to the phone's copy rather than replacing
    // it: a Custom Exercise the server hasn't received yet stays.
    async saveExercises(exercises: Exercise[]) {
      const tx = db.transaction('exercises', 'readwrite');
      await Promise.all([...exercises.map((exercise) => tx.store.put(exercise)), tx.done]);
    },

    // The lifter's own Exercise, for what the catalog doesn't have. Logged as weight × reps.
    async createExercise(name: string) {
      const id = `custom-${crypto.randomUUID()}`;
      await write({ id: crypto.randomUUID(), kind: 'saveExercise', exercise: { id, name: name.trim() } });
      return { id };
    },

    close() {
      closed = true;
      options.connectivity.removeEventListener('online', onOnline);
      clearTimeout(retry);
      db.close();
    },
  };
}

// The calendar date at a moment in a time zone, as YYYY-MM-DD.
function localDate(moment: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment);
}
