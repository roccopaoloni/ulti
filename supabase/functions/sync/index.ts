// The sync endpoint (spec: Sync endpoint). The phone's outbox sends the user's writes here as a
// batch of mutations; the endpoint saves them, then recomputes the user's whole history.
import { Client } from '@db/postgres';
import { withSupabase } from '@supabase/server';
import { recompute } from '../_shared/recompute.ts';

// What the phone saves. updatedAt is when the phone made the write: the latest one wins.
type SessionRecord = {
  id: string;
  startedAt: string;
  timeZone: string;
  localDate: string;
  finishedAt: string | null;
  updatedAt: string;
};
type SetRecord = {
  id: string;
  sessionId: string;
  exerciseId: string;
  weightKg: number;
  reps: number;
  loggedAt: string;
  updatedAt: string;
};
type Mutation = { id: string; kind: 'saveSession'; session: SessionRecord } | { id: string; kind: 'saveSet'; set: SetRecord };

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
      await recompute(client, userId);
      return Response.json({ rejected });
    } finally {
      await client.end();
    }
  }),
};

// Saves the mutations it hasn't seen before, and returns the IDs of those it rejected.
async function save(client: Client, userId: string, mutations: Mutation[], receivedAt: number) {
  const transaction = client.createTransaction('save');
  await transaction.begin();

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
  const rejected: string[] = [];
  for (const mutation of mutations) {
    if (!unseen.delete(mutation.id)) continue;
    if (mutation.kind === 'saveSession') keepLatest(sessions, mutation.session);
    else if (Date.parse(mutation.set.loggedAt) > receivedAt + clockAllowanceMs) rejected.push(mutation.id);
    else keepLatest(sets, mutation.set);
  }

  await transaction.queryArray`
    insert into public.sessions (user_id, id, started_at, time_zone, local_date, finished_at, updated_at)
    select ${userId}, s.id, s."startedAt", s."timeZone", s."localDate", s."finishedAt", s."updatedAt"
    from jsonb_to_recordset(${JSON.stringify([...sessions.values()])}::jsonb) as s(
      id uuid, "startedAt" timestamptz, "timeZone" text, "localDate" date, "finishedAt" timestamptz, "updatedAt" timestamptz
    )
    on conflict (user_id, id) do update set
      started_at = excluded.started_at,
      time_zone = excluded.time_zone,
      local_date = excluded.local_date,
      finished_at = excluded.finished_at,
      updated_at = excluded.updated_at
    where sessions.updated_at < excluded.updated_at`;
  await transaction.queryArray`
    insert into public.sets (user_id, id, session_id, exercise_id, weight_kg, reps, logged_at, updated_at)
    select ${userId}, s.id, s."sessionId", s."exerciseId", s."weightKg", s.reps, s."loggedAt", s."updatedAt"
    from jsonb_to_recordset(${JSON.stringify([...sets.values()])}::jsonb) as s(
      id uuid, "sessionId" uuid, "exerciseId" text, "weightKg" numeric, reps integer, "loggedAt" timestamptz, "updatedAt" timestamptz
    )
    on conflict (user_id, id) do update set
      session_id = excluded.session_id,
      exercise_id = excluded.exercise_id,
      weight_kg = excluded.weight_kg,
      reps = excluded.reps,
      logged_at = excluded.logged_at,
      updated_at = excluded.updated_at
    where sets.updated_at < excluded.updated_at`;
  await transaction.commit();
  return rejected;
}
