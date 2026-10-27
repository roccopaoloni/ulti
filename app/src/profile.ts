import { useCallback, useEffect, useState } from 'react';
import type { ProfileField, Units } from '@ulti/rules';
import { supabase } from './auth.ts';
import type { Language } from './i18n.ts';
import { useStored, write } from './stored.ts';
import type { Profile, Training } from './training.ts';

// The units weights are shown in. Weights are stored in kg whatever this says. It lives on the
// phone, and in the user's profile row so that a new phone knows it too.
const unitsKey = (userId: string) => `ulti-units:${userId}`;
export const useUnits = (userId: string) => useStored<Units>(unitsKey(userId));

export function setUnits(userId: string, units: Units) {
  write(unitsKey(userId), units);
  // Best effort: the choice is kept on this phone whether or not the server hears of it now.
  void supabase.from('profiles').upsert({ user_id: userId, units }).then(() => {}, () => {});
}

// The language the user picked, over the phone's own.
export const languageKey = 'ulti-language';
export const setLanguage = (language: Language) => write(languageKey, language);

// The server's copy of the user's profile history and units: what a phone that is new to this
// user lacks. Offline, the phone goes on with what it has.
async function pull(userId: string, training: Training) {
  const [history, profile] = await Promise.all([
    supabase.from('profile_history').select('field, effective_from, value'),
    supabase.from('profiles').select('units').maybeSingle(),
  ]);
  if (history.data) {
    await training.saveProfileHistory(
      history.data.map((row) => ({ field: row.field as ProfileField, effectiveFrom: row.effective_from, value: row.value })),
    );
  }
  if (profile.data?.units && localStorage.getItem(unitsKey(userId)) === null) write(unitsKey(userId), profile.data.units);
}

// The user's sex, bodyweight and Weekly Target on this phone. `ready` is true once the phone has
// also asked the server, so a returning user on a new phone isn't taken through onboarding again.
export function useBodyProfile(userId: string, training: Training | null) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const reload = useCallback(async () => {
    if (training) setProfile(await training.profile());
  }, [training]);

  useEffect(() => {
    let current = true;
    reload()
      .then(() => training && pull(userId, training))
      .catch(() => {})
      .then(reload)
      .then(() => current && setReady(training !== null));
    return () => {
      current = false;
    };
  }, [userId, training, reload]);

  return { profile, ready, reload };
}

export const hasEverything = (profile: Profile | null, units: Units | null) =>
  units !== null &&
  profile !== null &&
  profile.sex.length > 0 &&
  profile.bodyweightKg.length > 0 &&
  profile.weeklyTarget.length > 0;

// Today's date where the phone is, as YYYY-MM-DD.
export const today = () => new Date().toLocaleDateString('en-CA');
