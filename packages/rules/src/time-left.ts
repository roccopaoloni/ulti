// How long is left until an end instant, in the wording the Season and Group Period countdowns share:
// whole days from 48 hours up, whole hours below that, and "under an hour" in the last hour. All
// round down.
export type TimeLeft = { unit: 'days'; count: number } | { unit: 'hours'; count: number } | { unit: 'under-an-hour' };

const HOUR = 3_600_000;

export function timeLeft(now: Date, end: Date): TimeLeft {
  const hours = Math.floor((end.getTime() - now.getTime()) / HOUR);
  if (hours >= 48) return { unit: 'days', count: Math.floor(hours / 24) };
  if (hours >= 1) return { unit: 'hours', count: hours };
  return { unit: 'under-an-hour' };
}

// The instant a local date (YYYY-MM-DD) ends in a time zone: the midnight that starts the next day.
export function endOfLocalDay(localDate: string, timeZone: string): Date {
  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(year, month - 1, day + 1);
  // The zone's offset at a guess, then again at the corrected guess, to land right across a clock change.
  let instant = wall - offsetAt(wall, timeZone);
  instant = wall - offsetAt(instant, timeZone);
  return new Date(instant);
}

// A time zone's offset from UTC at an instant, in milliseconds.
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(instant / 1000) * 1000;
}
