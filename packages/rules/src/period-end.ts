import { weekStart } from './index.ts';

// The last local date (YYYY-MM-DD) of the Period that the local date falls in. Weeks run Monday to
// Sunday, as everywhere else.
export function periodEnd(period: 'week' | 'month' | 'year', localDate: string): string {
  if (period === 'year') return `${localDate.slice(0, 4)}-12-31`;
  if (period === 'month') {
    const day = new Date(`${localDate.slice(0, 7)}-01T00:00:00Z`);
    day.setUTCMonth(day.getUTCMonth() + 1, 0);
    return day.toISOString().slice(0, 10);
  }
  const day = new Date(`${weekStart(localDate)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 6);
  return day.toISOString().slice(0, 10);
}
