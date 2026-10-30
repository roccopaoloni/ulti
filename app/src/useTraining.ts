import { useEffect, useState } from 'react';
import { supabase } from './auth.ts';
import type { SetLabel } from '@ulti/rules';
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

// The Sessions and Sets the server holds, for a phone that is new to this user. Row-level
// security returns only this user's; deleted Sets stay on the server and aren't downloaded. The
// API returns at most 1000 rows a request, so they come page by page.
const pageSize = 1000;
async function pageThrough<Row>(page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>) {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error || !data) throw error ?? new Error('No rows');
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

// The API writes instants as `2026-10-20T12:00:00+00:00`; the phone keeps its own `toISOString()` form.
const instant = (value: string) => new Date(value).toISOString();

// Resolves to whether the phone got anything new.
async function refreshHistory(training: Training) {
  const sessions = await pageThrough((from, to) =>
    supabase.from('sessions').select('id, started_at, time_zone, local_date, finished_at, routine_day_id, updated_at').order('id').range(from, to),
  );
  const sets = await pageThrough((from, to) =>
    supabase
      .from('sets')
      .select('id, session_id, exercise_id, weight_kg, reps, label, rir, logged_at, updated_at')
      .eq('deleted', false)
      .order('id')
      .range(from, to),
  );
  return training.saveSessionsFromServer(
    sessions.map((row) => ({
      id: row.id,
      startedAt: instant(row.started_at),
      timeZone: row.time_zone,
      localDate: row.local_date,
      finishedAt: row.finished_at && instant(row.finished_at),
      ...(row.routine_day_id && { routineDayId: row.routine_day_id }),
      updatedAt: instant(row.updated_at),
    })),
    sets.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      exerciseId: row.exercise_id,
      weightKg: Number(row.weight_kg),
      reps: row.reps,
      ...(row.label && { label: row.label as SetLabel }),
      ...(row.rir !== null && { rir: row.rir }),
      loggedAt: instant(row.logged_at),
      updatedAt: instant(row.updated_at),
    })),
  );
}

// The signed-in user's training on this phone, once its store is open. `downloads` counts the
// times the server's Sessions and Sets brought something new, so screens that read them reload.
export function useTraining(userId: string): { training: Training | null; downloads: number } {
  const [training, setTraining] = useState<Training | null>(null);
  const [downloads, setDownloads] = useState(0);
  const download = (store: Training) =>
    refreshHistory(store).then((changed) => changed && setDownloads((n) => n + 1), () => {});

  useEffect(() => {
    // Ask the browser not to evict the user's data when the phone runs low on space.
    navigator.storage?.persist?.().catch(() => {});

    let opened: Training | undefined;
    let closed = false;
    const onOnline = () => {
      if (!opened) return;
      refreshCatalog(opened);
      download(opened);
    };
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
      download(store);
      addEventListener('online', onOnline);
    });
    return () => {
      closed = true;
      removeEventListener('online', onOnline);
      opened?.close();
      setTraining(null);
    };
  }, [userId]);

  return { training, downloads };
}
