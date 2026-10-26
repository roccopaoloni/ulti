// The full-history recompute (spec: Sync endpoint; ADR 0001): the rules package derives the user's
// Scoring Events from everything they have logged, and the result replaces their stored events.
// At this scale a full recompute takes milliseconds, so late or out-of-order syncs need no special
// handling.
import type { Client } from '@db/postgres';
import { deriveScoringEvents, type TrainingHistory } from '@ulti/rules';

type Transaction = ReturnType<Client['createTransaction']>;

// Saving a user's batch and recomputing their history each take this lock first, so for any one
// user they take turns: a recompute reads everything saved before it, and no recompute that read
// less can overwrite its result.
export async function lockUser(transaction: Transaction, userId: string) {
  await transaction.queryArray`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
}

// Recomputes the user's history and clears their dirty mark. If it fails, the mark stays and the
// scheduled retry tries again.
export async function recompute(client: Client, userId: string) {
  const transaction = client.createTransaction('recompute');
  await transaction.begin();
  await lockUser(transaction, userId);
  const {
    rows: [{ history }],
  } = await transaction.queryObject<{ history: TrainingHistory }>`
    select jsonb_build_object('sessions', coalesce(jsonb_agg(
      jsonb_build_object('localDate', s.local_date, 'sets', coalesce((
        select jsonb_agg(
          jsonb_build_object('exercise', t.exercise_id, 'weightKg', t.weight_kg, 'reps', t.reps)
          order by t.logged_at, t.id
        )
        from public.sets t
        where t.user_id = s.user_id and t.session_id = s.id
      ), '[]'::jsonb))
      order by s.started_at, s.id
    ), '[]'::jsonb)) as history
    from public.sessions s
    where s.user_id = ${userId}`;

  // Every kind of Scoring Event carries a deterministic ID. A database error ends the transaction
  // by itself; if the rules throw, it's rolled back here, so the connection can serve the next user.
  let events: { id: string }[];
  try {
    events = deriveScoringEvents(history);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
  const ids = JSON.stringify(events.map(({ id }) => id));
  await transaction.queryArray`
    delete from public.scoring_events
    where user_id = ${userId} and not (${ids}::jsonb ? id)`;
  await transaction.queryArray`
    insert into public.scoring_events (user_id, id, event)
    select ${userId}, e ->> 'id', e
    from jsonb_array_elements(${JSON.stringify(events)}::jsonb) e
    on conflict (user_id, id) do update set event = excluded.event`;
  await transaction.queryArray`delete from private.dirty_users where user_id = ${userId}`;
  await transaction.commit();
}
