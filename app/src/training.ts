import {
  bodyweightPromptDue,
  deriveScoringEvents,
  nextMonday,
  nextRoutineDay,
  type Dated,
  type ProfileField,
  type RoutineDay,
  type RoutineExercise,
  type Sex,
  type SetLabel,
  type TrainingHistory,
} from '@ulti/rules';
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
  // The Routine Day it was started from; none for an unplanned Session.
  routineDayId?: string;
  // When this phone last changed it: the server keeps the latest write.
  updatedAt: string;
};

export type SetRecord = {
  id: string;
  sessionId: string;
  exerciseId: string;
  weightKg: number;
  reps: number;
  // Set when the lifter overrides the detected label; otherwise the rules detect it.
  label?: SetLabel;
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

// One entry of a dated history (ADR 0002). A date has one entry per field; the server keeps the
// latest write.
export type ProfileEntry = { field: ProfileField; effectiveFrom: string; value: Sex | number; updatedAt: string };

// The user's sex, bodyweight (kg) and Weekly Target, each as its history.
export type Profile = {
  sex: Dated<Sex>[];
  bodyweightKg: Dated<number>[];
  weeklyTarget: Dated<number>[];
};


// The user's Routine: its Sessions in the order they are done. The user has one; if two phones each
// made one, the latest write is the Routine.
export type RoutineRecord = { id: string; days: RoutineDay[]; updatedAt: string };

export type Mutation =
  | { id: string; kind: 'saveSession'; session: SessionRecord }
  | { id: string; kind: 'saveSet'; set: SetRecord }
  | { id: string; kind: 'saveExercise'; exercise: { id: string; name: string } }
  | { id: string; kind: 'saveProfileEntry'; entry: ProfileEntry }
  | { id: string; kind: 'saveRoutine'; routine: RoutineRecord };

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
  // The last day the user was asked for bodyweight and dismissed the prompt.
  bodyweightPrompt: { key: 'dismissedOn'; value: string };
  // The catalog, as last fetched from the server.
  exercises: { key: string; value: Exercise };
  profile: { key: [string, string]; value: ProfileEntry };
  routines: { key: string; value: RoutineRecord };
}

// The Session being logged and the Exercises added to it, in order, including any with no Sets yet,
// and what the Routine Day it came from planned for them.
type InProgress = { sessionId: string; exerciseIds: string[]; plan?: RoutineExercise[] };

export type Training = Awaited<ReturnType<typeof openTraining>>;

export async function openTraining(userId: string, options: Options) {
  const db = await openDB<Store>(`ulti-${userId}`, 3, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('sessions', { keyPath: 'id' });
        db.createObjectStore('sets', { keyPath: 'id' }).createIndex('bySession', 'sessionId');
        db.createObjectStore('outbox', { autoIncrement: true });
        db.createObjectStore('state');
        db.createObjectStore('exercises', { keyPath: 'id' });
      }
      if (oldVersion < 2) {
        db.createObjectStore('profile', { keyPath: ['field', 'effectiveFrom'] });
        db.createObjectStore('bodyweightPrompt');
      }
      if (oldVersion < 3) {
        db.createObjectStore('routines', { keyPath: 'id' });
      }
    },
  });

  // Saves a record and queues its mutation in one transaction, with the Session in progress when
  // it changes: none of them exists without the others.
  async function write(mutation: Mutation, inProgress?: InProgress | null) {
    const tx = db.transaction(['sessions', 'sets', 'exercises', 'outbox', 'state', 'profile', 'routines'], 'readwrite');
    if (mutation.kind === 'saveSession') await tx.objectStore('sessions').put(mutation.session);
    else if (mutation.kind === 'saveProfileEntry') await tx.objectStore('profile').put(mutation.entry);
    else if (mutation.kind === 'saveRoutine') await tx.objectStore('routines').put(mutation.routine);
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
    // Starts a Session, from a Routine Day or unplanned. A Routine Day's Exercises are set up in order.
    async startSession(routineDayId?: string) {
      const day = routineDayId ? (await this.routine())?.days.find(({ id }) => id === routineDayId) : undefined;
      const now = options.now();
      const timeZone = options.timeZone();
      const session: SessionRecord = {
        id: crypto.randomUUID(),
        startedAt: now.toISOString(),
        timeZone,
        localDate: localDate(now, timeZone),
        finishedAt: null,
        ...(day && { routineDayId: day.id }),
        updatedAt: now.toISOString(),
      };
      const plan = day?.exercises ?? [];
      await write(
        { id: crypto.randomUUID(), kind: 'saveSession', session },
        { sessionId: session.id, exerciseIds: plan.map(({ exerciseId }) => exerciseId), plan },
      );
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

    // The lifter's one-tap override of a Set's detected label: written like an edit.
    async setLabel(setId: string, label: SetLabel) {
      const set = (await db.get('sets', setId))!;
      await write({ id: crypto.randomUUID(), kind: 'saveSet', set: { ...set, label, updatedAt: stamp() } });
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
      return { session, exerciseIds: inProgress.exerciseIds, plan: inProgress.plan ?? [], sets };
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

    // Sets a field of the profile. A change to the Weekly Target starts next Monday in the user's
    // time zone, so it can't be lowered on a Saturday to look consistent. The first one, set in
    // onboarding, is not a change, and the rest start today.
    async setProfile(field: ProfileField, value: Sex | number) {
      const now = options.now();
      const today = localDate(now, options.timeZone());
      const isChange = field === 'weeklyTarget' && (await db.getAll('profile')).some((entry) => entry.field === field);
      const entry: ProfileEntry = {
        field,
        effectiveFrom: isChange ? nextMonday(today) : today,
        value,
        updatedAt: now.toISOString(),
      };
      await write({ id: crypto.randomUUID(), kind: 'saveProfileEntry', entry });
    },

    async profile(): Promise<Profile> {
      const entries = await db.getAll('profile');
      const of = <T>(field: ProfileField) =>
        entries
          .filter((entry) => entry.field === field)
          .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
          .map(({ effectiveFrom, value }) => ({ effectiveFrom, value: value as T }));
      return { sex: of<Sex>('sex'), bodyweightKg: of<number>('bodyweightKg'), weeklyTarget: of<number>('weeklyTarget') };
    },

    // Keeps what the server holds of the profile, as on a phone that is new to this user. Whatever
    // the phone already has, including writes the server hasn't seen yet, stays as it is.
    async saveProfileHistory(entries: Omit<ProfileEntry, 'updatedAt'>[]) {
      const tx = db.transaction('profile', 'readwrite');
      for (const entry of entries) {
        if (!(await tx.store.get([entry.field, entry.effectiveFrom]))) await tx.store.put({ ...entry, updatedAt: '' });
      }
      await tx.done;
    },

    // Whether it is time to ask for bodyweight again: two weeks after the last time the user gave
    // it or dismissed the prompt. Before a first bodyweight, onboarding asks instead.
    async bodyweightPromptDue() {
      const given = (await this.profile()).bodyweightKg.at(-1)?.effectiveFrom;
      if (!given) return false;
      const dismissed = await db.get('bodyweightPrompt', 'dismissedOn');
      return bodyweightPromptDue(dismissed && dismissed > given ? dismissed : given, localDate(options.now(), options.timeZone()));
    },

    async dismissBodyweightPrompt() {
      await db.put('bodyweightPrompt', localDate(options.now(), options.timeZone()), 'dismissedOn');
    },

    // The Scoring Events derived from everything on this phone, the Session in progress included:
    // provisional until the server's recompute (spec: instant "PR!" badge), by the same rules.
    // `without` leaves one Session out, to see what it added.
    async scoring(without?: string) {
      const sessions = (await db.getAll('sessions')).filter(({ id }) => id !== without);
      sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      const custom = new Map((await db.getAll('exercises')).map((exercise) => [exercise.id, exercise.custom]));
      const history: TrainingHistory = {
        userId,
        weeklyTargets: (await this.profile()).weeklyTarget,
        sessions: await Promise.all(
          sessions.map(async ({ id, localDate }) => {
            const sets = await db.getAllFromIndex('sets', 'bySession', id);
            sets.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
            return {
              localDate,
              sets: sets.map((set) => ({
                id: set.id,
                exercise: set.exerciseId,
                custom: custom.get(set.exerciseId) ?? false,
                weightKg: set.weightKg,
                reps: set.reps,
                label: set.label,
              })),
            };
          }),
        ),
      };
      const all = deriveScoringEvents(history);
      return {
        history,
        events: all.filter((event) => event.kind === 'personal-record'),
        consistency: all.filter((event) => event.kind === 'consistency'),
      };
    },

    // The user's Routine, the latest written, or null before they make one.
    async routine() {
      const all = await db.getAll('routines');
      return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
    },

    // The Routine Day to do next, or null before there is a Routine.
    async nextRoutineDay() {
      const days = (await this.routine())?.days;
      if (!days?.length) return null;
      const fromRoutine = (await db.getAll('sessions')).filter((session) => session.routineDayId);
      const last = fromRoutine.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
      const id = nextRoutineDay(days.map((day) => day.id), last?.routineDayId);
      return days.find((day) => day.id === id)!;
    },

    // Creates the Routine, or replaces its Sessions: the same Routine written again, so the latest
    // write wins.
    async saveRoutine(days: RoutineDay[]) {
      const id = (await this.routine())?.id ?? crypto.randomUUID();
      await write({ id: crypto.randomUUID(), kind: 'saveRoutine', routine: { id, days, updatedAt: stamp() } });
    },

    // Keeps the Routine the server holds, as on a phone that is new to this user, unless the phone
    // has a later write of it.
    async saveRoutineFromServer(routine: RoutineRecord) {
      const kept = await db.get('routines', routine.id);
      if (!kept || kept.updatedAt < routine.updatedAt) await db.put('routines', routine);
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
