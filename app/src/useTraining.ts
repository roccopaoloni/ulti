import { useEffect, useState } from 'react';
import { supabase } from './auth.ts';
import { openTraining, type Send, type Training } from './training.ts';

const send: Send = async (mutations) => {
  // After reconnecting, supabase-js can report no session for up to about 90 s while it waits out
  // a token refresh cooldown. That isn't being signed out: the sync fails and tries again later.
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('No session to sync with yet');
  const { data: result, error } = await supabase.functions.invoke('sync', { body: { mutations } });
  if (error) throw error;
  return result;
};

// The catalog changes rarely, so the phone keeps the copy it fetched last.
async function refreshCatalog(training: Training) {
  // Row-level security returns the shared catalog and this user's own Custom Exercises.
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name_en, name_es, type, equipment, default_increment_kg, muscle, owner_id');
  if (error) return;
  await training.saveExercises(
    data.map(({ id, name_en, name_es, type, equipment, default_increment_kg, muscle, owner_id }) => ({
      id,
      nameEn: name_en,
      nameEs: name_es,
      equipment,
      custom: owner_id !== null,
      incrementKg: Number(default_increment_kg),
      bodyweight: type === 'bodyweight',
      muscle,
    })),
  );
}

// The Routine the server holds, for a phone that is new to this user.
async function refreshRoutine(training: Training) {
  const { data } = await supabase.from('routines').select('id, days, updated_at');
  for (const row of data ?? []) await training.saveRoutineFromServer({ id: row.id, days: row.days, updatedAt: row.updated_at });
}

// The Increment overrides the server holds, for a phone that is new to this user.
async function refreshIncrements(training: Training) {
  const { data } = await supabase.from('increment_overrides').select('exercise_id, increment_kg, updated_at');
  await training.saveIncrementsFromServer(
    (data ?? []).map((row) => ({ exerciseId: row.exercise_id, incrementKg: Number(row.increment_kg), updatedAt: row.updated_at })),
  );
}

// The Deload Weeks the server holds, for a phone that is new to this user.
async function refreshDeloads(training: Training) {
  const { data } = await supabase.from('deload_weeks').select('week, origin, reason, status, updated_at');
  await training.saveDeloadsFromServer(
    (data ?? []).map((row) => ({ week: row.week, origin: row.origin, reason: row.reason ?? undefined, status: row.status, updatedAt: row.updated_at })),
  );
}

// The signed-in user's training on this phone, once its store is open.
export function useTraining(userId: string): Training | null {
  const [training, setTraining] = useState<Training | null>(null);

  useEffect(() => {
    // Ask the browser not to evict the user's data when the phone runs low on space.
    navigator.storage?.persist?.().catch(() => {});

    let opened: Training | undefined;
    let closed = false;
    const onOnline = () => opened && refreshCatalog(opened);
    openTraining(userId, {
      send,
      connectivity: window,
      now: () => new Date(),
      timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      retryAfterMs: 30_000,
    }).then((store) => {
      if (closed) return store.close();
      opened = store;
      setTraining(store);
      refreshCatalog(store);
      refreshRoutine(store).catch(() => {});
      refreshIncrements(store).catch(() => {});
      refreshDeloads(store).catch(() => {});
      addEventListener('online', onOnline);
    });
    return () => {
      closed = true;
      removeEventListener('online', onOnline);
      opened?.close();
      setTraining(null);
    };
  }, [userId]);

  return training;
}
