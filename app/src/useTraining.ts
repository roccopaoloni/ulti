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
    .select('id, name_en, name_es, equipment, default_increment_kg, owner_id');
  if (error) return;
  await training.saveExercises(
    data.map(({ id, name_en, name_es, equipment, default_increment_kg, owner_id }) => ({
      id,
      nameEn: name_en,
      nameEs: name_es,
      equipment,
      custom: owner_id !== null,
      incrementKg: Number(default_increment_kg),
    })),
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
