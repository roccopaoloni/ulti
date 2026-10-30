// The sync endpoint (spec: Sync endpoint). The phone's outbox sends the user's writes here as a
// batch of mutations; the endpoint saves them, then recomputes the user's whole history.
import { Client } from '@db/postgres';
import { withSupabase } from '@supabase/server';
import { isProfileValue, weekStart } from '@ulti/rules';
import { lockUser, recompute } from '../_shared/recompute.ts';

// What the phone saves. updatedAt is when the phone made the write: the latest one wins.
type SessionRecord = {
  id: string;
  startedAt: string;
  timeZone: string;
  localDate: string;
  finishedAt: string | null;
  routineDayId?: string;
  updatedAt: string;
};
type SetRecord = {
  id: string;
  sessionId: string;
  exerciseId: string;
  weightKg: number;
  reps: number;
  label?: 'warm-up' | 'working';
  rir?: number;
  deleted?: boolean;
  loggedAt: string;
  updatedAt: string;
};
// One entry of a dated history: the value in force from a local date on (ADR 0002).
type ProfileEntry = { field: string; effectiveFrom: string; value: unknown; updatedAt: string };
type ExerciseRecord = { id: string; name: string };
// The Routine is saved whole: its Sessions are never looked into here.
type RoutineRecord = { id: string; days: unknown[]; updatedAt: string };
type IncrementRecord = { exerciseId: string; incrementKg: number; updatedAt: string };
// A Deload Week, by the Monday that starts it: suggested or self-started, accepted or dismissed.
type DeloadRecord = { week: string; origin: 'suggested' | 'self'; reason?: string; status: 'accepted' | 'dismissed'; updatedAt: string };
type Mutation =
  | { id: string; kind: 'saveDeload'; deload: DeloadRecord }
  | { id: string; kind: 'saveSession'; session: SessionRecord }
  | { id: string; kind: 'saveSet'; set: SetRecord }
  | { id: string; kind: 'saveExercise'; exercise: ExerciseRecord }
  | { id: string; kind: 'saveProfileEntry'; entry: ProfileEntry }
  | { id: string; kind: 'saveRoutine'; routine: RoutineRecord }
  | { id: string; kind: 'saveIncrement'; increment: IncrementRecord };

// Sets dated after the moment the endpoint received them are rejected. A phone's clock can run a
// little fast, though, and a Set synced the moment it's logged would be lost to that: this much
// ahead still counts as now.
const clockAllowanceMs = 5 * 60_000;

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const receivedAt = Date.now();
    const userId = ctx.userClaims!.id;
    const { mutations } = (await req.json()) as { mutations: Mutation[] };

    const client = new Client(Deno.env.get('SUPABASE_DB_URL'));
    try {
      await client.connect();
      const rejected = await save(client, userId, mutations, receivedAt);
      // The batch is saved whatever happens next. A failed recompute leaves the user marked dirty,
      // and the scheduled retry recomputes them.
      await recompute(client, userId).catch((error) => console.error('Recompute failed', userId, error));
      return Response.json({ rejected });
    } finally {
      await client.end();
    }
  }),
};

// The rules a mutation must meet to be saved. One that breaks them is rejected alone: it's never
// saved, the rest of the batch is, and the phone drops it from its outbox. New rules go here, and
// any the database would refuse must too, or its error would fail the whole batch for good.
function isRejected(mutation: Mutation, receivedAt: number) {
  switch (mutation.kind) {
    case 'saveDeload': {
      // A Deload Week starts on a Monday, and only a suggestion has a reason to be dismissed.
      const { deload } = mutation;
      return weekStart(deload.week) !== deload.week || (deload.origin === 'self' && deload.status !== 'accepted');
    }
    case 'saveProfileEntry':
      return !isProfileValue(mutation.entry.field, mutation.entry.value);
    // A Custom Exercise's ID is `custom-` and then its own, so it never stands in for a catalog one.
    case 'saveExercise':
      return !mutation.exercise.id.startsWith('custom-');
    case 'saveIncrement':
      return !(mutation.increment.incrementKg > 0);
    case 'saveSet': {
      const { rir } = mutation.set;
      return (
        Date.parse(mutation.set.loggedAt) > receivedAt + clockAllowanceMs ||
        (rir != null && !(Number.isInteger(rir) && rir >= 0 && rir <= 4))
      );
    }
    default:
      return false;
  }
}

// Saves the mutations it hasn't seen before, and returns the IDs of those it rejected.
async function save(client: Client, userId: string, mutations: Mutation[], receivedAt: number) {
  const transaction = client.createTransaction('save');
  await transaction.begin();
  await lockUser(transaction, userId);

  // A mutation whose ID is already in the log was decided when it first arrived, so it's skipped.
  const { rows: logged } = await transaction.queryObject<{ id: string }>`
    insert into private.mutation_log (user_id, id)
    select ${userId}, id::uuid
    from jsonb_array_elements_text(${JSON.stringify(mutations.map(({ id }) => id))}::jsonb) as id
    on conflict do nothing
    returning id::text`;
  const unseen = new Set(logged.map(({ id }) => id));

  // A batch can save the same Session or Set twice, as when a Session starts and finishes: the
  // latest write of each goes on.
  const sessions = new Map<string, SessionRecord>();
  const sets = new Map<string, SetRecord>();
  const keepLatest = <T extends { id: string; updatedAt: string }>(records: Map<string, T>, record: T) => {
    const kept = records.get(record.id);
    if (!kept || Date.parse(kept.updatedAt) <= Date.parse(record.updatedAt)) records.set(record.id, record);
  };
  const routines = new Map<string, RoutineRecord>();
  const increments = new Map<string, IncrementRecord & { id: string }>();
  const deloads = new Map<string, DeloadRecord & { id: string }>();
  const exercises = new Map<string, ExerciseRecord>();
  const entries = new Map<string, ProfileEntry & { id: string }>();
  const rejected: string[] = [];
  for (const mutation of mutations) {
    if (!unseen.delete(mutation.id)) continue;
    if (isRejected(mutation, receivedAt)) {
      rejected.push(mutation.id);
      continue;
    }
    if (mutation.kind === 'saveSession') keepLatest(sessions, mutation.session);
    else if (mutation.kind === 'saveRoutine') keepLatest(routines, mutation.routine);
    else if (mutation.kind === 'saveDeload') keepLatest(deloads, { ...mutation.deload, id: mutation.deload.week });
    else if (mutation.kind === 'saveIncrement') keepLatest(increments, { ...mutation.increment, id: mutation.increment.exerciseId });
    else if (mutation.kind === 'saveExercise') exercises.set(mutation.exercise.id, mutation.exercise);
    else if (mutation.kind === 'saveProfileEntry') {
      const { entry } = mutation;
      keepLatest(entries, { ...entry, id: `${entry.field} ${entry.effectiveFrom}` });
    } else keepLatest(sets, mutation.set);
  }

  // A Custom Exercise is saved before the Sets that use it. It's named once and never changes, so
  // an ID that exists already, whoever owns it, is left alone. The one name serves both languages,
  // and the Increment is a placeholder: Custom Exercises never get recommendations.
  await transaction.queryArray`
    insert into public.exercises (id, name_en, name_es, type, default_increment_kg, owner_id)
    select e.id, e.name, e.name, 'weighted', 2.5, ${userId}
    from jsonb_to_recordset(${JSON.stringify([...exercises.values()])}::jsonb) as e(id text, name text)
    on conflict (id) do nothing`;
  await transaction.queryArray`
    insert into public.sessions(user_id, id, started_at, time_zone, local_date, finished_at, routine_day_id, updated_at)
    select ${userId}, s.id, s."startedAt", s."timeZone", s."localDate", s."finishedAt", s."routineDayId", s."updatedAt"
    from jsonb_to_recordset(${JSON.stringify([...sessions.values()])}::jsonb) as s(
      id uuid, "startedAt" timestamptz, "timeZone" text, "localDate" date, "finishedAt" timestamptz, "routineDayId" text, "updatedAt" timestamptz
    )
    on conflict (user_id, id) do update set
      started_at = excluded.started_at,
      time_zone = excluded.time_zone,
      local_date = excluded.local_date,
      finished_at = excluded.finished_at,
      routine_day_id = excluded.routine_day_id,
      updated_at = excluded.updated_at
    where sessions.updated_at < excluded.updated_at`;
  await transaction.queryArray`
    insert into public.sets (user_id, id, session_id, exercise_id, weight_kg, reps, label, rir, deleted, logged_at, updated_at)
    select ${userId}, s.id, s."sessionId", s."exerciseId", s."weightKg", s.reps, s.label, s.rir, coalesce(s.deleted, false), s."loggedAt", s."updatedAt"
    from jsonb_to_recordset(${JSON.stringify([...sets.values()])}::jsonb) as s(
      id uuid, "sessionId" uuid, "exerciseId" text, "weightKg" numeric, reps integer, label text, rir smallint, deleted boolean, "loggedAt" timestamptz, "updatedAt" timestamptz
    )
    on conflict (user_id, id) do update set
      session_id = excluded.session_id,
      exercise_id = excluded.exercise_id,
      weight_kg = excluded.weight_kg,
      reps = excluded.reps,
      label = excluded.label,
      rir = excluded.rir,
      deleted = excluded.deleted,
      logged_at = excluded.logged_at,
      updated_at = excluded.updated_at
    where sets.updated_at < excluded.updated_at`;
  await transaction.queryArray`
    insert into public.routines (user_id, id, days, updated_at)
    select ${userId}, r.id, r.days, r."updatedAt"
    from jsonb_to_recordset(${JSON.stringify([...routines.values()])}::jsonb) as r(
      id uuid, days jsonb, "updatedAt" timestamptz
    )
    on conflict (user_id, id) do update set
      days = excluded.days,
      updated_at = excluded.updated_at
    where routines.updated_at < excluded.updated_at`;
  await transaction.queryArray`
    insert into public.increment_overrides (user_id, exercise_id, increment_kg, updated_at)
    select ${userId}, i."exerciseId", i."incrementKg", i."updatedAt"
    from jsonb_to_recordset(${JSON.stringify([...increments.values()])}::jsonb) as i(
      "exerciseId" text, "incrementKg" numeric, "updatedAt" timestamptz
    )
    on conflict (user_id, exercise_id) do update set
      increment_kg = excluded.increment_kg,
      updated_at = excluded.updated_at
    where increment_overrides.updated_at < excluded.updated_at`;
  await transaction.queryArray`
    insert into public.deload_weeks (user_id, week, origin, reason, status, updated_at)
    select ${userId}, d.week, d.origin, d.reason, d.status, d."updatedAt"
    from jsonb_to_recordset(${JSON.stringify([...deloads.values()])}::jsonb) as d(
      week date, origin text, reason text, status text, "updatedAt" timestamptz
    )
    on conflict (user_id, week) do update set
      origin = excluded.origin,
      reason = excluded.reason,
      status = excluded.status,
      updated_at = excluded.updated_at
    where deload_weeks.updated_at < excluded.updated_at`;
  await transaction.queryArray`
    insert into public.profile_history (user_id, field, effective_from, value, updated_at)
    select ${userId}, e.field, e."effectiveFrom", e.value, e."updatedAt"
    from jsonb_to_recordset(${JSON.stringify([...entries.values()])}::jsonb) as e(
      field text, "effectiveFrom" date, value jsonb, "updatedAt" timestamptz
    )
    on conflict (user_id, field, effective_from) do update set
      value = excluded.value,
      updated_at = excluded.updated_at
    where profile_history.updated_at < excluded.updated_at`;
  // The user's Scoring Events are out of date until the recompute succeeds.
  await transaction.queryArray`insert into private.dirty_users (user_id) values (${userId}) on conflict do nothing`;
  await transaction.commit();
  return rejected;
}
