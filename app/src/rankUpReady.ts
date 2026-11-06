// Whether the Rank-up gate can decide yet. A phone that has already seen a Rank decides from the
// Season Rank Points it holds (its own Scoring Events and the last floor the server reported). A
// phone that has never seen one waits for the server, so a new phone's empty history can't pass
// for a Rank.
export function rankUpReady({ seasonPoints, scoring, seen, settled }: { seasonPoints: number | null; scoring: unknown; seen: unknown; settled: boolean }): boolean {
  if (seasonPoints === null || scoring === null) return false;
  return seen !== null || settled;
}
