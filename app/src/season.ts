import { seasonOf, seasonRankPoints } from '@ulti/rules';
import { useEffect, useState } from 'react';
import { supabase, useUser } from './auth.ts';
import { today } from './profile.ts';
import { write } from './stored.ts';
import type { Training } from './training.ts';

export type Standing = { points: number; position: number | null; top_percent: number | null };

// The Season Rank Points the server last reported, per user and Season. A new Season starts from
// points the phone's own Scoring Events don't hold (the soft reset), so offline the phone would show
// a drop to Bronze, and a Rank-up when it came back online. This is the floor it counts from.
const reportedKey = (userId: string, seasonId: string) => `ulti-season-points:${userId}:${seasonId}`;

function reported(key: string): number {
  try {
    return Number(JSON.parse(localStorage.getItem(key) ?? '0')) || 0;
  } catch {
    return 0;
  }
}

// The user's Season Rank Points. They come from the Scoring Events on this phone, so they are there
// offline; the standing comes from the server's read RPC, which returns only the caller's own
// numbers. Online, the higher of the two decides: a new phone holds none of the user's history,
// and the server hasn't yet seen a Session logged offline. The server's points include the starting
// points from the soft reset, which the phone can't work out, so it keeps the last it was told.
// `settled` is true once the server has answered or failed to, so nothing is decided from the
// phone's partial history while it waits.
export function useSeasonStanding(training: Training) {
  const user = useUser();
  const [local, setLocal] = useState<{ points: number; scoring: Awaited<ReturnType<Training['scoring']>> } | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const season = seasonOf(today());
    training.scoring().then((scoring) => setLocal({ points: seasonRankPoints(0, [...scoring.events, ...scoring.consistency], season), scoring }));
    supabase.rpc('season_standing', { on_date: today() }).then(
      ({ data }) => {
        if (data) {
          setStanding(data as Standing);
          if (user) write(reportedKey(user.id, season.id), (data as Standing).points);
        }
        setSettled(true);
      },
      () => setSettled(true),
    );
  }, [training, user?.id]);
  const floor = user ? reported(reportedKey(user.id, seasonOf(today()).id)) : 0;
  return {
    seasonPoints: local && Math.max(local.points, standing?.points ?? floor),
    scoring: local?.scoring ?? null,
    standing,
    settled,
  };
}
