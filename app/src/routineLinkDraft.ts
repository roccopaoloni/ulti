import { unpackRoutineLink } from '@ulti/rules';
import { useStored, write } from './stored.ts';

// The Routine Link a signed-out visitor opened, kept on the phone (the part after `#`) through
// sign-up, login and any reload, until onboarding's Routine step uses it or the account turns out
// to be onboarded already.
const key = 'ulti-routine-link';
export const useKeptRoutineLink = () => useStored<string>(key);
export const dropRoutineLink = () => write(key, null);

export function captureRoutineLink() {
  if (location.pathname === '/r' && location.hash.length > 1) write(key, location.hash.slice(1));
}

// The Routine the onboarding Routine step starts from: the kept link read against the catalog,
// as a draft with Custom Exercises still to resolve (`training.resolveRoutineLink`) before `saveRoutineDraft`. Null when the link can't be read.
export function routineFromLink(data: string, catalog: readonly { id: string; custom: boolean }[]) {
  const link = unpackRoutineLink(data, new Set(catalog.filter((exercise) => !exercise.custom).map(({ id }) => id)));
  if (!link) return null;
  const draft = link.days.map((day) => ({ ...day, id: crypto.randomUUID() }));
  return { sender: link.sender, draft, dropped: link.dropped };
}
