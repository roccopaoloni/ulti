// "Thu" for a Day done within the last week, otherwise a short date like "Oct 22". Both are local
// dates (yyyy-mm-dd); `never` is the text for a Day not done yet.
export function lastDoneLabel(language: string, lastDone: string | null, today: string, never: string): string {
  if (!lastDone) return never;
  const days = (Date.parse(today) - Date.parse(lastDone)) / 86_400_000;
  const options: Intl.DateTimeFormatOptions = days >= 0 && days < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(new Date(lastDone));
}
