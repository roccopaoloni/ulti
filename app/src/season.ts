import { seasonOf, seasonRankPoints } from '@ulti/rules';
import { useEffect, useState } from 'react';
import { supabase } from './auth.ts';
import { today } from './profile.ts';
import type { Training } from './training.ts';

export type Standing = { points: number; position: number | null; top_percent: number | null };

// The user's Season Rank Points. They come from the Scoring Events on this phone, so they are there
// offline; the standing comes from the server's read RPC, which returns only the caller's own
// numbers. Online, the higher of the two decides: a new phone holds none of the user's history,
// and the server hasn't yet seen a Session logged offline. `settled` is true once the server has
// answered or failed to, so nothing is decided from the phone's partial history while it waits.
export function useSeasonStanding(training: Training) {
  const [local, setLocal] = useState<{ points: number; scoring: Awaited<ReturnType<Training['scoring']>> } | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const season = seasonOf(today());
    training.scoring().then((scoring) => setLocal({ points: seasonRankPoints(0, [...scoring.events, ...scoring.consistency], season), scoring }));
    supabase.rpc('season_standing', { on_date: today() }).then(
      ({ data }) => {
        if (data) setStanding(data as Standing);
        setSettled(true);
      },
      () => setSettled(true),
    );
  }, [training]);
  return {
    seasonPoints: local && Math.max(local.points, standing?.points ?? 0),
    scoring: local?.scoring ?? null,
    standing,
    settled,
  };
}
