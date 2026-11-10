import {
  bodyweightPromptDue,
  canStartDeload,
  deloadedLastWeek,
  completeRoutine,
  deriveScoringEvents,
  findCustomExercise,
  findJumps,
  isImplausibleSet,
  moveSet,
  nextMonday,
  orderSets,
  isMuscle,
  routineDayChoices,
  suggestedRoutineDay,
  recommend,
  recommendDeload,
  weekStamps,
  weekStart,
  type Dated,
  type MovementPattern,
  type Muscle,
  type DeloadReason,
  type LinkDay,
  type ProfileField,
  type RoutineDay,
  type RoutineExercise,
  type Sex,
  type SetLabel,
  type TrainingHistory,
  valueInForce,
} from '@ulti/rules';
import { deleteDB, openDB, type DBSchema } from 'idb';

// The user's own training lives on the phone, in IndexedDB, so logging never needs a signal
// (ADR 0003). Every write is also a mutation, with an ID made on the phone, kept in an outbox
// until the sync endpoint has it. The endpoint ignores IDs it has already applied, so sending a
// mutation twice is harmless.

// Thrown instead of saving a Set beyond its Exercise's ceiling; the screens show the sheet.
export class ImplausibleSet extends Error {
  constructor() {
    super('Implausible Set');
  }
}

// Thrown instead of saving a Set that is a jump (spec: Implausible Sets), with how far over the
// lifter's baseline it is, in percent. The screens ask; saving again with `confirmedJump` goes through.
export class JumpSet extends Error {
  percent: number;
  constructor(percent: number) {
    super('Jump');
    this.percent = percent;
  }
}

export type SessionRecord = {
  id: string;
  // The moment it started in UTC, the lifter's IANA time zone and the local date there (spec: Time).
  startedAt: string;
  timeZone: string;
  localDate: string;
  finishedAt: string | null;
  // A Session finished with no Sets is discarded: sent once more marked deleted, so the server forgets it too.
  deleted?: boolean;
  // The Routine Day it was started from; none for an unplanned Session.
  routineDayId?: string;
  // Started while a Deload Week was on (ADR 0007); absent for a normal Session. It stays set even if that Deload Week is later cancelled.
  deload?: boolean;
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
  // Where the lifter dragged the Set among its Exercise's Sets in the Session; none until they do.
  position?: number;
  // Reps in reserve when the lifter logged it: 0 to 4, where 4 means 4 or more.
  rir?: number;
  // A deleted Set is sent once more marked deleted, so the server forgets it too.
  deleted?: boolean;
  loggedAt: string;
  updatedAt: string;
};

// An Exercise, as the phone keeps it for picking one offline: from the catalog, or a Custom Exercise
// of this user's (spec: Catalog seed). A Custom Exercise has one name and no equipment, unless it is bodyweight.
export type Exercise = {
  id: string;
  nameEn: string;
  nameEs: string;
  equipment: string | null;
  custom: boolean;
  incrementKg: number;
  // Pull-ups, dips and the like: logged as the weight added to the lifter's own bodyweight.
  bodyweight: boolean;
  // The main muscle it is filed under. A copy of the catalog kept before muscles existed lacks it
  // until the next refresh.
  muscle: Muscle;
  // Its Movement Pattern. A Custom Exercise, and a copy of the catalog kept before patterns existed,
  // has none, which counts as isolation.
  pattern?: MovementPattern | null;
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


// The lifter's own Increment for an Exercise, replacing its default (spec: Increment defaults).
// The latest write wins.
export type IncrementOverride = { exerciseId: string; incrementKg: number; updatedAt: string };

// The user's Routine: its Sessions in the order they are done. The user has one; if two phones each
// made one, the latest write is the Routine.
export type RoutineRecord = { id: string; days: RoutineDay[]; updatedAt: string };

// "I don't follow a routine": a yes or no that holds until changed, and that saving a Routine
// clears. The latest write wins.
export type NoRoutineRecord = { value: boolean; updatedAt: string };

// A Deload Week the lifter started themselves, or answered a suggestion for (spec: Deload Weeks,
// suggested or self-started, accepted or dismissed). It is the week starting on `week` (a Monday);
// the latest write for a week wins.
export type DeloadRecord = {
  week: string;
  origin: 'suggested' | 'self';
  // Why the app suggested it.
  reason?: DeloadReason;
  status: 'accepted' | 'dismissed';
  updatedAt: string;
};

export type Mutation =
  | { id: string; kind: 'saveDeload'; deload: DeloadRecord }
  | { id: string; kind: 'saveSession'; session: SessionRecord }
  | { id: string; kind: 'saveSet'; set: SetRecord }
  | { id: string; kind: 'saveExercise'; exercise: { id: string; name: string; muscle: Muscle; equipment?: 'bodyweight' } }
  | { id: string; kind: 'saveProfileEntry'; entry: ProfileEntry }
  | { id: string; kind: 'saveRoutine'; routine: RoutineRecord }
  | { id: string; kind: 'saveNoRoutine'; noRoutine: NoRoutineRecord }
  // The lifter finished or skipped the Tutorial. It only ever turns to seen.
  | { id: string; kind: 'saveTutorialSeen' }
  | { id: string; kind: 'saveIncrement'; increment: IncrementOverride };

// The sync endpoint: it resolves once the server has the batch, and throws otherwise.
// `moved`: profile entries the server saved from another date than the phone's.
export type Send = (mutations: Mutation[]) => Promise<{ rejected: string[]; moved?: { id: string; effectiveFrom: string }[] }>;

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
  increments: { key: string; value: IncrementOverride };
  deloads: { key: string; value: DeloadRecord };
  // Set once the profile history has been downloaded from the server.
  downloaded: { key: 'profile'; value: true };
  // The Routine as the lifter is editing it, kept only while it is not whole (so not the Routine yet).
  routineDraft: { key: 'days'; value: RoutineDay[] };
  noRoutine: { key: 'choice'; value: NoRoutineRecord };
  // Whether the Tutorial was seen: present once it has been, here or on another phone.
  tutorial: { key: 'seen'; value: true };
}

// The Session being logged and the Exercises added to it, in order, including any with no Sets yet,
// and what the Routine Day it came from planned for them.
type InProgress = { sessionId: string; exerciseIds: string[]; plan?: RoutineExercise[] };

// The Increment of an Exercise missing from the phone's catalog copy.
const DEFAULT_INCREMENT_KG = 2.5;
// The Rep Range the Deload Week suggestion assumes for an Exercise trained without a Routine. Fatigue
// is judged on the Sets logged, so the range only shapes the reset weight, which the suggestion ignores.
const UNPLANNED_REP_RANGE = { repMin: 8, repMax: 12 };

export type Training = Awaited<ReturnType<typeof openTraining>>;

export async function openTraining(userId: string, options: Options) {
  const db = await openDB<Store>(`ulti-${userId}`, 10, {
    async upgrade(db, oldVersion, _newVersion, tx) {
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
      if (oldVersion < 4) {
        db.createObjectStore('increments', { keyPath: 'exerciseId' });
      }
      if (oldVersion < 5) {
        db.createObjectStore('deloads', { keyPath: 'week' });
      }
      if (oldVersion < 6) {
        db.createObjectStore('downloaded');
      }
      if (oldVersion < 7) {
        db.createObjectStore('routineDraft');
      }
      if (oldVersion < 8) {
        db.createObjectStore('noRoutine');
      }
      if (oldVersion < 10) {
        db.createObjectStore('tutorial');
        // One-off: a phone already onboarded before the Tutorial existed has seen it, as the
        // server's migration marked the account. Not an outbox write: the server has it, and the
        // phone may be offline when it first opens this version.
        if (oldVersion >= 1 && (await tx.objectStore('profile').count()) > 0) await tx.objectStore('tutorial').put(true, 'seen');
      }
      if (oldVersion >= 5 && oldVersion < 9) {
        // One-off: Sessions logged before the mark existed are Deload Sessions if their week is an
        // accepted Deload Week, as the server's migration did. Not an outbox write: the server has it.
        const weeks = (await tx.objectStore('deloads').getAll()).filter(({ status }) => status === 'accepted').map(({ week }) => week);
        for (const session of await tx.objectStore('sessions').getAll()) {
          if (weeks.includes(weekStart(session.localDate))) await tx.objectStore('sessions').put({ ...session, deload: true });
        }
      }
    },
  });

  // Saves a record and queues its mutation in one transaction, with the Session in progress when
  // it changes: none of them exists without the others.
  async function write(mutation: Mutation, inProgress?: InProgress | null) {
    const tx = db.transaction(['sessions', 'sets', 'exercises', 'outbox', 'state', 'profile', 'routines', 'increments', 'deloads', 'noRoutine', 'tutorial'], 'readwrite');
    if (mutation.kind === 'saveDeload') await tx.objectStore('deloads').put(mutation.deload);
    else if (mutation.kind === 'saveNoRoutine') await tx.objectStore('noRoutine').put(mutation.noRoutine, 'choice');
    else if (mutation.kind === 'saveTutorialSeen') await tx.objectStore('tutorial').put(true, 'seen');
    else if (mutation.kind === 'saveSession') {
      if (mutation.session.deleted) await tx.objectStore('sessions').delete(mutation.session.id);
      else await tx.objectStore('sessions').put(mutation.session);
    }
    else if (mutation.kind === 'saveProfileEntry') await tx.objectStore('profile').put(mutation.entry);
    else if (mutation.kind === 'saveRoutine') {
      await tx.objectStore('routines').put(mutation.routine);
      // The server clears the choice on a Routine too, so no mutation is queued for it.
      if (mutation.routine.days.length > 0) await tx.objectStore('noRoutine').put({ value: false, updatedAt: mutation.routine.updatedAt }, 'choice');
    }
    else if (mutation.kind === 'saveIncrement') await tx.objectStore('increments').put(mutation.increment);
    else if (mutation.kind === 'saveSet') {
      if (mutation.set.deleted) await tx.objectStore('sets').delete(mutation.set.id);
      else await tx.objectStore('sets').put(mutation.set);
    } else {
      const { id, name, muscle, equipment } = mutation.exercise;
      await tx.objectStore('exercises').put({ id, nameEn: name, nameEs: name, equipment: equipment ?? null, custom: true, incrementKg: 2.5, bodyweight: equipment === 'bodyweight', muscle });
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
    const { moved = [] } = await options.send(mutations);
    // A Weekly Target change synced late starts later than the phone said: the phone's copy follows
    // the server's, unless a newer write already holds the new date.
    const done = db.transaction(['outbox', 'profile'], 'readwrite');
    for (const { id, effectiveFrom } of moved) {
      const sent = mutations.find((mutation) => mutation.id === id);
      if (sent?.kind !== 'saveProfileEntry') continue;
      const { entry } = sent;
      await done.objectStore('profile').delete([entry.field, entry.effectiveFrom]);
      const held = await done.objectStore('profile').get([entry.field, effectiveFrom]);
      if (!held || held.updatedAt < entry.updatedAt) await done.objectStore('profile').put({ ...entry, effectiveFrom });
    }
    await done.objectStore('outbox').delete(IDBKeyRange.bound(keys[0], keys[keys.length - 1]));
    await done.done;
  }

  const onOnline = () => sync();
  options.connectivity.addEventListener('online', onOnline);
  // Whatever an earlier visit left in the outbox goes as soon as the app opens.
  sync();

  const stamp = () => options.now().toISOString();
  // A Session's Sets in the order they are done: logged order, then each Exercise's Sets by the position the lifter gave them.
  const inOrder = (sets: SetRecord[]) =>
    orderSets([...sets].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)).map((set) => ({ exercise: set.exerciseId, position: set.position, set }))).map(({ set }) => set);

  // Saving a Set checks it first, on the phone with the rules' own function (spec: Implausible Sets).
  async function refuseImplausible(exerciseId: string, weightKg: number, reps: number) {
    const exercise = await db.get('exercises', exerciseId);
    const bodyweights = (await db.getAll('profile')).filter((entry) => entry.field === 'bodyweightKg');
    const bodyweightKg = valueInForce(
      bodyweights.map(({ effectiveFrom, value }) => ({ effectiveFrom, value: value as number })),
      localDate(options.now(), options.timeZone()),
    );
    const set = { exercise: exerciseId, custom: exercise?.custom ?? false, bodyweight: exercise?.bodyweight ?? false, weightKg, reps };
    if (isImplausibleSet(set, bodyweightKg)) throw new ImplausibleSet();
  }

  return {
    // Starts a Session, from a Routine Day or unplanned. A Routine Day's Exercises are set up in order.
    async startSession(routineDayId?: string) {
      const day = routineDayId ? (await this.routine())?.days.find(({ id }) => id === routineDayId) : undefined;
      const now = options.now();
      const timeZone = options.timeZone();
      const deload = (await this.deload()).active;
      const session: SessionRecord = {
        id: crypto.randomUUID(),
        startedAt: now.toISOString(),
        timeZone,
        localDate: localDate(now, timeZone),
        finishedAt: null,
        ...(day && { routineDayId: day.id }),
        ...(deload && { deload }),
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

    // `label` is the one the row showed, which the Set keeps from then on.
    // A jump is refused with JumpSet unless `confirmedJump` says the lifter lifted it; the ceiling never is.
    async logSet(sessionId: string, exerciseId: string, weightKg: number, reps: number, label?: SetLabel, { confirmedJump = false } = {}) {
      await refuseImplausible(exerciseId, weightKg, reps);
      if (!confirmedJump) {
        const percent = findJumps(await this.history(undefined, { sessionId, exercise: exerciseId, weightKg, reps, label })).get('candidate');
        if (percent !== undefined) throw new JumpSet(percent);
      }
      const loggedAt = stamp();
      const set: SetRecord = { id: crypto.randomUUID(), sessionId, exerciseId, weightKg, reps, label, loggedAt, updatedAt: loggedAt };
      await write({ id: crypto.randomUUID(), kind: 'saveSet', set });
      return set;
    },

    // Fixes a Set's weight and reps: the same Set written again, so the latest write wins.
    async editSet(setId: string, weightKg: number, reps: number, { confirmedJump = false } = {}) {
      const set = (await db.get('sets', setId))!;
      await refuseImplausible(set.exerciseId, weightKg, reps);
      if (!confirmedJump) {
        const percent = findJumps(await this.history(undefined, { sessionId: set.sessionId, id: setId, exercise: set.exerciseId, weightKg, reps })).get(setId);
        if (percent !== undefined) throw new JumpSet(percent);
      }
      await write({ id: crypto.randomUUID(), kind: 'saveSet', set: { ...set, weightKg, reps, updatedAt: stamp() } });
    },

    // The lifter's one-tap override of a Set's detected label: written like an edit. A Warm-up Set has
    // no RIR, so flipping to it clears any.
    async setLabel(setId: string, label: SetLabel) {
      const set = (await db.get('sets', setId))!;
      const { rir, ...rest } = set;
      await write({ id: crypto.randomUUID(), kind: 'saveSet', set: { ...(label === 'warm-up' ? rest : set), label, updatedAt: stamp() } });
    },

    // Drags a Set to `toIndex` among its Exercise's Sets in the Session: every Set of the Exercise
    // is written with its place, and a Set that lands in front of a Warm-up Set becomes a Warm-up
    // Set of the lifter's own (which has no RIR). The logged times stay as they were.
    async moveSet(setId: string, toIndex: number) {
      const set = (await db.get('sets', setId))!;
      const own = inOrder(await db.getAllFromIndex('sets', 'bySession', set.sessionId)).filter((other) => other.exerciseId === set.exerciseId);
      const moved = moveSet(own.map((other) => ({ id: other.id, weightKg: other.weightKg, label: other.label })), setId, toIndex);
      const updatedAt = stamp();
      for (const [position, id] of moved.ids.entries()) {
        const kept = own.find((other) => other.id === id)!;
        const { rir, ...rest } = kept;
        const flipped = id === setId && moved.warmUp;
        if (kept.position === position && !flipped) continue;
        await write({ id: crypto.randomUUID(), kind: 'saveSet', set: { ...(flipped ? rest : kept), ...(flipped && { label: 'warm-up' as const }), position, updatedAt } });
      }
    },

    // The Set's RIR, optional: written like an edit.
    async setRir(setId: string, rir: number) {
      const set = (await db.get('sets', setId))!;
      await write({ id: crypto.randomUUID(), kind: 'saveSet', set: { ...set, rir, updatedAt: stamp() } });
    },

    async deleteSet(setId: string) {
      const set = (await db.get('sets', setId))!;
      await write({ id: crypto.randomUUID(), kind: 'saveSet', set: { ...set, deleted: true, updatedAt: stamp() } });
    },

    // The finished Sessions with Sets, newest first, each with its Sets in the order they were logged.
    async pastSessions() {
      const finished = (await db.getAll('sessions')).filter((session) => session.finishedAt !== null);
      finished.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      const past = await Promise.all(
        finished.map(async (session) => {
          const sets = inOrder(await db.getAllFromIndex('sets', 'bySession', session.id));
          return { session, sets };
        }),
      );
      return past.filter(({ sets }) => sets.length > 0);
    },

    // Finishing a Session with no Sets throws it away: the same Session written again marked
    // deleted, so it never shows in History or counts as a Routine Day, here or on the server.
    async discardSession(sessionId: string) {
      const session = (await db.get('sessions', sessionId))!;
      await write({ id: crypto.randomUUID(), kind: 'saveSession', session: { ...session, deleted: true, updatedAt: stamp() } }, null);
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
      const sets = inOrder(await db.getAllFromIndex('sets', 'bySession', inProgress.sessionId));
      return { session, exerciseIds: inProgress.exerciseIds, plan: inProgress.plan ?? [], sets };
    },

    // Keeps the Sessions and Sets the server holds, as on a phone that is new to this user. Anything
    // still in the outbox is the phone's newer word and stays as it is (a Set deleted here is not
    // brought back), and so does a copy the phone wrote later. Deleted Sets are never downloaded.
    // Resolves to whether anything on the phone changed.
    async saveSessionsFromServer(sessions: SessionRecord[], sets: SetRecord[]) {
      const tx = db.transaction(['sessions', 'sets', 'outbox'], 'readwrite');
      const queued = new Set<string>();
      let changed = false;
      for (const mutation of await tx.objectStore('outbox').getAll()) {
        if (mutation.kind === 'saveSession') queued.add(mutation.session.id);
        else if (mutation.kind === 'saveSet') queued.add(mutation.set.id);
      }
      for (const [store, records] of [[tx.objectStore('sessions'), sessions], [tx.objectStore('sets'), sets]] as const) {
        for (const record of records) {
          if (queued.has(record.id)) continue;
          const kept = await store.get(record.id);
          if (kept && Date.parse(kept.updatedAt) >= Date.parse(record.updatedAt)) continue;
          await store.put(record as never);
          changed = true;
        }
      }
      await tx.done;
      return changed;
    },

    // The Exercise's Sets from the last Session that had it, other than the one in progress: what
    // the next Session's rows are pre-filled with.
    async lastSets(exerciseId: string) {
      const inProgress = await db.get('state', 'sessionInProgress');
      const sets = (await db.getAll('sets')).filter((set) => set.exerciseId === exerciseId && set.sessionId !== inProgress?.sessionId);
      // Deload Sessions are skipped: their lighter Sets are not what the next Session builds on.
      const sessions = (await Promise.all([...new Set(sets.map((set) => set.sessionId))].map((id) => db.get('sessions', id)))).filter(
        (session) => !session!.deload,
      );
      if (sessions.length === 0) return [];
      const last = sessions.reduce((a, b) => (a!.startedAt > b!.startedAt ? a : b))!;
      return inOrder(sets.filter((set) => set.sessionId === last.id));
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
      const tx = db.transaction(['profile', 'downloaded'], 'readwrite');
      const store = tx.objectStore('profile');
      for (const entry of entries) {
        if (!(await store.get([entry.field, entry.effectiveFrom]))) await store.put({ ...entry, updatedAt: '' });
      }
      await tx.objectStore('downloaded').put(true, 'profile');
      await tx.done;
    },

    // Whether the phone has heard the server's profile history. Until it has, it can't tell a new
    // user from a returning one, so it must not onboard.
    async profileDownloaded() {
      return (await db.get('downloaded', 'profile')) === true;
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
      const history = await this.history(without);
      const all = deriveScoringEvents(history);
      return {
        history,
        events: all.filter((event) => event.kind === 'personal-record'),
        consistency: all.filter((event) => event.kind === 'consistency'),
      };
    },

    // The lifter's whole TrainingHistory, as the rules read it. A `candidate` Set is put in as if it
    // were saved: the edited Set (`id`) with its new numbers, or a new one at the end of its Session.
    async history(without?: string, candidate?: { sessionId: string; id?: string; exercise: string; weightKg: number; reps: number; label?: SetLabel }) {
      const sessions = (await db.getAll('sessions')).filter(({ id }) => id !== without);
      sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      const profile = await this.profile();
      const catalog = new Map((await db.getAll('exercises')).map((exercise) => [exercise.id, exercise]));
      const history: TrainingHistory = {
        userId,
        weeklyTargets: profile.weeklyTarget,
        profile,
        deloadWeeks: await this.deloadWeeks(),
        sessions: await Promise.all(
          sessions.map(async ({ id, localDate, deload }) => {
            const sets = inOrder(await db.getAllFromIndex('sets', 'bySession', id));
            const rows = sets.map((set) => {
              const edited = candidate?.id === set.id ? candidate : undefined;
              return {
                id: set.id,
                exercise: set.exerciseId,
                custom: catalog.get(set.exerciseId)?.custom ?? false,
                bodyweight: catalog.get(set.exerciseId)?.bodyweight ?? false,
                weightKg: edited?.weightKg ?? set.weightKg,
                reps: edited?.reps ?? set.reps,
                label: set.label,
                rir: set.rir,
              };
            });
            if (candidate && !candidate.id && candidate.sessionId === id) {
              const { exercise } = candidate;
              rows.push({
                id: 'candidate',
                exercise,
                custom: catalog.get(exercise)?.custom ?? false,
                bodyweight: catalog.get(exercise)?.bodyweight ?? false,
                weightKg: candidate.weightKg,
                reps: candidate.reps,
                label: candidate.label,
                rir: undefined,
              });
            }
            return { localDate, ...(deload && { deload }), sets: rows };
          }),
        ),
      };
      return history;
    },

    // Whether this week's Weekly Target is already met, so another Session is an extra one that
    // earns no Consistency Points.
    async weeklyTargetMet() {
      const week = weekStart(localDate(options.now(), options.timeZone()));
      return weekStamps((await this.scoring()).consistency).includes(week);
    },

    // The user's Routine, the latest written, or null before they make one.
    async routine() {
      const all = await db.getAll('routines');
      return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
    },

    // The Suggested Day: the Routine Day done longest ago, or null before there is a Routine.
    async nextRoutineDay() {
      const days = (await this.routine())?.days;
      if (!days?.length) return null;
      const done = (await db.getAll('sessions')).flatMap((session) => (session.routineDayId ? [{ dayId: session.routineDayId, startedAt: session.startedAt }] : []));
      const id = suggestedRoutineDay(days.map((day) => day.id), done);
      return days.find((day) => day.id === id)!;
    },

    // The Days to pick from when starting a Session: the Suggested Day first, then the rest in
    // Routine order, each with its last done date. Empty before there is a Routine.
    async dayChoices() {
      const days = (await this.routine())?.days ?? [];
      const done = (await db.getAll('sessions')).flatMap((session) =>
        session.routineDayId ? [{ dayId: session.routineDayId, startedAt: session.startedAt, localDate: session.localDate }] : [],
      );
      return routineDayChoices(days, done);
    },

    // Creates the Routine, or replaces its Sessions: the same Routine written again, so the latest
    // write wins.
    async saveRoutine(days: RoutineDay[]) {
      const id = (await this.routine())?.id ?? crypto.randomUUID();
      await write({ id: crypto.randomUUID(), kind: 'saveRoutine', routine: { id, days, updatedAt: stamp() } });
    },

    // Accepts a Stall's advice (spec: Stall): the Exercise's Rep Range changes to the new one on the
    // Routine Day the Session in progress came from, and on that Session's plan, as an ordinary
    // Routine edit. Other Days keep theirs. It notes the Session's local date as `rangeSince`, from when a
    // Stall counts Sessions again.
    async switchRepRange(sessionId: string, exerciseId: string, repMin: number, repMax: number) {
      const inProgress = await db.get('state', 'sessionInProgress');
      const started = await db.get('sessions', sessionId);
      const dayId = started?.routineDayId;
      const routine = await this.routine();
      if (inProgress?.sessionId !== sessionId || !started || !dayId || !routine) return;
      const switched = (exercise: RoutineExercise) => (exercise.exerciseId === exerciseId ? { ...exercise, repMin, repMax, rangeSince: started.localDate } : exercise);
      const days = routine.days.map((day) => (day.id === dayId ? { ...day, exercises: day.exercises.map(switched) } : day));
      await write(
        { id: crypto.randomUUID(), kind: 'saveRoutine', routine: { id: routine.id, days, updatedAt: stamp() } },
        { ...inProgress, plan: inProgress.plan?.map(switched) },
      );
    },

    // Whether the lifter said they don't follow a routine. Saving a Routine clears it.
    async followsNoRoutine() {
      return (await db.get('noRoutine', 'choice'))?.value ?? false;
    },

    async setFollowsNoRoutine(value: boolean) {
      await write({ id: crypto.randomUUID(), kind: 'saveNoRoutine', noRoutine: { value, updatedAt: stamp() } });
    },

    // Keeps the choice the server holds, as on a phone that is new to this user, unless the phone
    // has a later write of it.
    async saveNoRoutineFromServer(choice: NoRoutineRecord) {
      const kept = await db.get('noRoutine', 'choice');
      if (!kept || Date.parse(kept.updatedAt) < Date.parse(choice.updatedAt)) await db.put('noRoutine', choice, 'choice');
    },

    // Whether the Tutorial was seen on this account. Finishing or skipping it marks it seen; leaving
    // it midway does not.
    async tutorialSeen() {
      return (await db.get('tutorial', 'seen')) === true;
    },

    async markTutorialSeen() {
      await write({ id: crypto.randomUUID(), kind: 'saveTutorialSeen' });
    },

    // As on a phone that is new to this user: the server already has it, so nothing is queued.
    async saveTutorialSeenFromServer() {
      await db.put('tutorial', true, 'seen');
    },

    // What the Routine editor shows: the draft the lifter left unfinished, else the Routine.
    async routineDraft() {
      return (await db.get('routineDraft', 'days')) ?? (await this.routine())?.days ?? [];
    },

    // Autosave of the Routine editor: every edit lands here and stays on the phone. A whole draft
    // becomes the Routine and syncs; any other stays a draft and is never sent. Edits made while
    // offline replace the Routine still waiting in the outbox, so it holds one, as it ended up.
    async saveRoutineDraft(days: RoutineDay[]) {
      const whole = completeRoutine(days);
      if (!whole) {
        await db.put('routineDraft', days, 'days');
        return;
      }
      const tx = db.transaction(['outbox', 'routineDraft'], 'readwrite');
      for (let cursor = await tx.objectStore('outbox').openCursor(); cursor; cursor = await cursor.continue()) {
        if (cursor.value.kind === 'saveRoutine') await cursor.delete();
      }
      await tx.objectStore('routineDraft').delete('days');
      await tx.done;
      await this.saveRoutine(whole);
    },

    // Keeps the Routine the server holds, as on a phone that is new to this user, unless the phone
    // has a later write of it.
    async saveRoutineFromServer(routine: RoutineRecord) {
      const kept = await db.get('routines', routine.id);
      if (!kept || kept.updatedAt < routine.updatedAt) await db.put('routines', routine);
    },

    // The catalog and the user's Custom Exercises, each with the Increment in force: the lifter's
    // own if they set one, else the default.
    async exercises() {
      const overrides = new Map((await db.getAll('increments')).map((override) => [override.exerciseId, override.incrementKg]));
      return (await db.getAll('exercises')).map((exercise) => ({ ...exercise, incrementKg: overrides.get(exercise.id) ?? exercise.incrementKg }));
    },

    async setIncrement(exerciseId: string, incrementKg: number) {
      await write({ id: crypto.randomUUID(), kind: 'saveIncrement', increment: { exerciseId, incrementKg, updatedAt: stamp() } });
    },

    // Keeps the overrides the server holds, as on a phone that is new to this user, unless the
    // phone has a later write of one.
    async saveIncrementsFromServer(overrides: IncrementOverride[]) {
      const tx = db.transaction('increments', 'readwrite');
      for (const override of overrides) {
        const kept = await tx.store.get(override.exerciseId);
        if (!kept || kept.updatedAt < override.updatedAt) await tx.store.put(override);
      }
      await tx.done;
    },

    // The advice for the Exercise's next Session: a Stall reset (spec: Stall), else going heavier
    // (spec: Go heavier), else none. Judged on the Sessions before the one in progress. Custom
    // Exercises never get a recommendation, and neither do the lifts a suggested Deload Week covers.
    async recommendation(exerciseId: string, repRange: { repMin: number; repMax: number; rangeSince?: string }) {
      if ((await this.deload()).suggestion?.exercises.includes(exerciseId)) return undefined;
      const exercise = (await this.exercises()).find(({ id }) => id === exerciseId);
      const inProgress = await db.get('state', 'sessionInProgress');
      const { history } = await this.scoring(inProgress?.sessionId);
      const { rangeSince, ...range } = repRange;
      return recommend(history, exerciseId, { ...range, since: rangeSince, incrementKg: exercise?.incrementKg ?? DEFAULT_INCREMENT_KG });
    },

    // The Mondays of the Deload Weeks the lifter started or accepted.
    async deloadWeeks() {
      return (await db.getAll('deloads')).filter(({ status }) => status === 'accepted').map(({ week }) => week).sort();
    },

    // Whether this week is a Deload Week, whether the lifter can start one, and the app's
    // suggestion for one, if any and not dismissed (spec: Deload Week). The Routine's catalog
    // Exercises are what the suggestion looks at, or with no Routine the catalog Exercises trained
    // in the last four weeks.
    async deload() {
      const today = localDate(options.now(), options.timeZone());
      const inProgress = await db.get('state', 'sessionInProgress');
      const { history } = await this.scoring(inProgress?.sessionId);
      const catalog = await this.exercises();
      const routine = new Map<string, { exercise: string; rule: { repMin: number; repMax: number; incrementKg: number }; pattern: MovementPattern | null | undefined }>();
      const planned = (await this.routine())?.days.flatMap((day) => day.exercises) ?? [];
      const since = new Date(Date.parse(`${today}T00:00:00Z`) - 28 * 86_400_000).toISOString().slice(0, 10);
      const lifts = planned.length
        ? planned
        : [...new Set(history.sessions.filter(({ localDate }) => localDate >= since).flatMap(({ sets }) => sets.map(({ exercise }) => exercise)))].map(
            (exerciseId) => ({ exerciseId, ...UNPLANNED_REP_RANGE }),
          );
      for (const lift of lifts) {
        const exercise = catalog.find(({ id }) => id === lift.exerciseId);
        if (!exercise || exercise.custom || routine.has(lift.exerciseId)) continue;
        routine.set(lift.exerciseId, {
          exercise: lift.exerciseId,
          rule: { repMin: lift.repMin, repMax: lift.repMax, incrementKg: exercise.incrementKg },
          pattern: exercise.pattern,
        });
      }
      // Only dismissed suggestions keep it quiet: a Deload Week the lifter started and cancelled leaves no trace.
      const dismissed = (await db.getAll('deloads')).filter(({ status, origin }) => status === 'dismissed' && origin === 'suggested').map(({ week }) => week);
      return {
        active: history.deloadWeeks!.includes(weekStart(today)),
        canStart: canStartDeload(history, today),
        deloadedLastWeek: deloadedLastWeek(history, today),
        suggestion: recommendDeload(history, today, [...routine.values()], dismissed),
      };
    },

    // The lifter starts a Deload Week themselves, in any week that isn't one already, also again after
    // cancelling one (the later write wins): false when this week is one.
    async startDeload() {
      if (!(await this.deload()).canStart) return false;
      const deload: DeloadRecord = {
        week: weekStart(localDate(options.now(), options.timeZone())),
        origin: 'self',
        status: 'accepted',
        updatedAt: stamp(),
      };
      await write({ id: crypto.randomUUID(), kind: 'saveDeload', deload });
      return true;
    },

    // Accepts or dismisses the suggested Deload Week; both answers are stored.
    async answerDeload(accept: boolean) {
      const reason = (await this.deload()).suggestion?.reason;
      if (!reason) return;
      const deload: DeloadRecord = {
        week: weekStart(localDate(options.now(), options.timeZone())),
        origin: 'suggested',
        reason,
        status: accept ? 'accepted' : 'dismissed',
        updatedAt: stamp(),
      };
      await write({ id: crypto.randomUUID(), kind: 'saveDeload', deload });
    },

    // Cancels this week's Deload Week by writing it as dismissed (ADR 0007), keeping who started it.
    // The Sessions already logged stay Deload Sessions; a dismissed week is not suggested again.
    async cancelDeload() {
      const week = weekStart(localDate(options.now(), options.timeZone()));
      const kept = await db.get('deloads', week);
      if (kept?.status !== 'accepted') return;
      await write({ id: crypto.randomUUID(), kind: 'saveDeload', deload: { ...kept, status: 'dismissed', updatedAt: stamp() } });
    },

    // Keeps the Deload Weeks the server holds, as on a phone that is new to this user, unless the
    // phone has a later write of one.
    async saveDeloadsFromServer(deloads: DeloadRecord[]) {
      const tx = db.transaction('deloads', 'readwrite');
      for (const deload of deloads) {
        const kept = await tx.store.get(deload.week);
        if (!kept || kept.updatedAt < deload.updatedAt) await tx.store.put(deload);
      }
      await tx.done;
    },

    // Exercises are never removed, so the refresh adds to the phone's copy rather than replacing
    // it: a Custom Exercise the server hasn't received yet stays.
    async saveExercises(exercises: Exercise[]) {
      const tx = db.transaction('exercises', 'readwrite');
      await Promise.all([...exercises.map((exercise) => tx.store.put(exercise)), tx.done]);
    },

    // The lifter's own Exercise, for what the catalog doesn't have, filed under a main muscle so the
    // picker can find it. Logged as weight × reps, or as reps with optional added weight when it is
    // bodyweight. That is chosen here and never changes, as it would change what logged Sets mean.
    async createExercise(name: string, muscle: Muscle, bodyweight = false) {
      if (!isMuscle(muscle)) throw new Error('A Custom Exercise needs a muscle');
      const id = `custom-${crypto.randomUUID()}`;
      await write({ id: crypto.randomUUID(), kind: 'saveExercise', exercise: { id, name: name.trim(), muscle, ...(bodyweight ? { equipment: 'bodyweight' as const } : {}) } });
      return { id };
    },

    // A Routine Link's Days as the lifter's own: each Custom Exercise in it becomes the lifter's
    // matching one (same name and equipment), else a new one made like any they create by hand.
    // Loading the same link again finds the ones made before, so it adds none.
    async resolveRoutineLink<D extends LinkDay>(days: D[]): Promise<(Omit<D, 'exercises'> & { exercises: RoutineExercise[] })[]> {
      const own = await this.exercises();
      const resolved: (Omit<D, 'exercises'> & { exercises: RoutineExercise[] })[] = [];
      for (const day of days) {
        const exercises: RoutineExercise[] = [];
        for (const e of day.exercises) {
          if ('exerciseId' in e) {
            exercises.push(e);
            continue;
          }
          const { custom, ...plan } = e;
          let exerciseId = findCustomExercise(custom, own);
          const bodyweight = custom.equipment === 'bodyweight';
          if (!exerciseId) {
            exerciseId = (await this.createExercise(custom.name, custom.muscle, bodyweight)).id;
            own.push({ id: exerciseId, nameEn: custom.name.trim(), nameEs: custom.name.trim(), equipment: bodyweight ? 'bodyweight' : null, custom: true, incrementKg: 2.5, bodyweight, muscle: custom.muscle });
          }
          exercises.push({ ...plan, exerciseId });
        }
        resolved.push({ ...day, exercises });
      }
      return resolved;
    },

    close() {
      closed = true;
      options.connectivity.removeEventListener('online', onOnline);
      clearTimeout(retry);
      db.close();
    },

    // Account deletion: stops syncing and removes this user's database from the phone, outbox
    // included, so nothing queued is ever sent.
    async erase() {
      this.close();
      await deleteDB(`ulti-${userId}`);
    },
  };
}

// The calendar date at a moment in a time zone, as YYYY-MM-DD.
function localDate(moment: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment);
}
