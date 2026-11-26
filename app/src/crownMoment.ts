export type Period = 'week' | 'month' | 'year';
export type Crown = { id: number; group_name: string; period: Period; points: number; shared_with: number };
export type CrownRow = { id: number; group: string; period: Period; points: number; tiedWith: number };

// What the crown moment shows for the wins waiting: the title follows the biggest Period among them
// (year, then month, then week) and each win gets one row, in the order the server gave.
export function crownMoment(crowns: Crown[]): { period: Period; rows: CrownRow[] } {
  const period = (['year', 'month', 'week'] as const).find((p) => crowns.some((c) => c.period === p)) ?? 'week';
  const rows = crowns.map((c) => ({ id: c.id, group: c.group_name, period: c.period, points: c.points, tiedWith: c.shared_with }));
  return { period, rows };
}
