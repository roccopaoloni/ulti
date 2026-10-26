// The sync endpoint (spec: Sync endpoint). The phone's outbox sends the user's writes here as a
// batch of mutations; the endpoint saves them, then recomputes the user's whole history.
import { Client } from '@db/postgres';
import { withSupabase } from '@supabase/server';
import { recompute } from '../_shared/recompute.ts';

type SessionRecord = { id: string; startedAt: string; timeZone: string; localDate: string; finishedAt: string | null };
type SetRecord = { id: string; sessionId: string; exerciseId: string; weightKg: number; reps: number; loggedAt: string };
type Mutation = { id: string; kind: 'saveSession'; session: SessionRecord } | { id: string; kind: 'saveSet'; set: SetRecord };

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const userId = ctx.userClaims!.id;
    const { mutations } = (await req.json()) as { mutations: Mutation[] };

    const client = new Client(Deno.env.get('SUPABASE_DB_URL'));
    try {
      await client.connect();
      await save(client, userId, mutations);
      await recompute(client, userId);
      return Response.json({ rejected: [] });
    } finally {
      await client.end();
    }
  }),
};

async function save(client: Client, userId: string, mutations: Mutation[]) {
  // A batch can save the same Session or Set twice, as when a Session starts and finishes.
  const sessions = new Map<string, SessionRecord>();
  const sets = new Map<string, SetRecord>();
  for (const mutation of mutations) {
    if (mutation.kind === 'saveSession') sessions.set(mutation.session.id, mutation.session);
    else sets.set(mutation.set.id, mutation.set);
  }

  const transaction = client.createTransaction('save');
  await transaction.begin();
  await transaction.queryArray`
    insert into public.sessions (user_id, id, started_at, time_zone, local_date, finished_at)
    select ${userId}, s.id, s."startedAt", s."timeZone", s."localDate", s."finishedAt"
    from jsonb_to_recordset(${JSON.stringify([...sessions.values()])}::jsonb)
      as s(id uuid, "startedAt" timestamptz, "timeZone" text, "localDate" date, "finishedAt" timestamptz)
    on conflict (user_id, id) do update set
      started_at = excluded.started_at,
      time_zone = excluded.time_zone,
      local_date = excluded.local_date,
      finished_at = excluded.finished_at`;
  await transaction.queryArray`
    insert into public.sets (user_id, id, session_id, exercise_id, weight_kg, reps, logged_at)
    select ${userId}, s.id, s."sessionId", s."exerciseId", s."weightKg", s.reps, s."loggedAt"
    from jsonb_to_recordset(${JSON.stringify([...sets.values()])}::jsonb)
      as s(id uuid, "sessionId" uuid, "exerciseId" text, "weightKg" numeric, reps integer, "loggedAt" timestamptz)
    on conflict (user_id, id) do update set
      session_id = excluded.session_id,
      exercise_id = excluded.exercise_id,
      weight_kg = excluded.weight_kg,
      reps = excluded.reps,
      logged_at = excluded.logged_at`;
  await transaction.commit();
}
