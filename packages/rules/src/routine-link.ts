import { dayColour, DAY_COLOURS, isMuscle, type Muscle, type RoutineDay, type RoutineExercise } from './index.ts';

// A Routine Link carries a copy of a Routine in the URL fragment (spec: Routine Link): JSON of
// [version, sender's display name, [[Day name, colour, [[Exercise ID, Sets, min reps, max reps]]]]],
// as UTF-8 in base64url. Nothing is stored anywhere, so it is a snapshot that cannot be revoked.
// A Custom Exercise is private to its owner, so in place of an Exercise ID it carries
// [name, equipment or null, main muscle]; links made with catalog IDs only stay valid.
const VERSION = 1;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
// The most the Routine editor lets a lifter step to.
const MAX_SETS = 20;
const MAX_REPS = 50;

export type LinkCustomExercise = { name: string; equipment: string | null; muscle: Muscle };
// An Exercise as unpacked: a catalog one by ID, or a Custom Exercise by what describes it.
export type LinkExercise = Omit<RoutineExercise, 'exerciseId'> & ({ exerciseId: string } | { custom: LinkCustomExercise });
export type LinkDay = Omit<RoutineDay, 'id' | 'exercises'> & { exercises: LinkExercise[] };

// `customs` holds the sender's Custom Exercises by ID.
export function packRoutineLink(days: readonly RoutineDay[], sender: string, customs: ReadonlyMap<string, LinkCustomExercise> = new Map()): string {
  const body = days.map((day, index) => [
    day.name,
    dayColour(days, index),
    day.exercises.map((e) => {
      const custom = customs.get(e.exerciseId);
      return [custom ? [custom.name, custom.equipment, custom.muscle] : e.exerciseId, e.sets, e.repMin, e.repMax];
    }),
  ]);
  const bytes = Array.from(encodeURIComponent(JSON.stringify([VERSION, sender, body])).matchAll(/%(..)|(.)/g), (m) => (m[1] ? parseInt(m[1], 16) : m[2].charCodeAt(0)));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[n & 63];
  }
  return out;
}

function decode(data: string): unknown {
  const sextets = Array.from(data, (c) => ALPHABET.indexOf(c));
  if (sextets.length === 0 || sextets.includes(-1) || sextets.length % 4 === 1) throw new Error('unreadable');
  let escaped = '';
  for (let i = 0; i < sextets.length; i += 4) {
    const n = (sextets[i] << 18) | (sextets[i + 1] << 12) | ((sextets[i + 2] ?? 0) << 6) | (sextets[i + 3] ?? 0);
    const bytes = [n >> 16, (n >> 8) & 255, n & 255].slice(0, Math.min(3, sextets.length - i - 1));
    for (const byte of bytes) escaped += '%' + byte.toString(16).padStart(2, '0');
  }
  return JSON.parse(decodeURIComponent(escaped));
}

const whole = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= max;

// What a Routine Link holds, for this app's catalog (`known` is the set of catalog Exercise IDs):
// Catalog Exercises it doesn't know are dropped and counted, and so is a Day left with none. Null when the
// data can't be read, has another version, or leaves nothing to load.
export function unpackRoutineLink(
  data: string,
  known: ReadonlySet<string>,
): { sender: string; days: LinkDay[]; dropped: number } | null {
  try {
    const parsed = decode(data);
    if (!Array.isArray(parsed) || parsed[0] !== VERSION) return null;
    const [, sender, rawDays] = parsed;
    if (typeof sender !== 'string' || !Array.isArray(rawDays)) return null;
    let dropped = 0;
    const days: LinkDay[] = [];
    for (const rawDay of rawDays) {
      const [name, colour, rawExercises] = rawDay;
      if (typeof name !== 'string' || name.trim() === '' || !Number.isInteger(colour) || colour < 0 || colour >= DAY_COLOURS || !Array.isArray(rawExercises)) return null;
      const exercises: LinkExercise[] = [];
      for (const [exerciseId, sets, repMin, repMax] of rawExercises) {
        if (!whole(sets, MAX_SETS) || !whole(repMin, MAX_REPS) || !whole(repMax, MAX_REPS) || repMin > repMax) return null;
        if (Array.isArray(exerciseId)) {
          const [customName, equipment, muscle] = exerciseId;
          if (typeof customName !== 'string' || customName.trim() === '' || !(equipment === null || typeof equipment === 'string') || !isMuscle(muscle)) return null;
          exercises.push({ custom: { name: customName, equipment, muscle }, sets, repMin, repMax });
        } else if (typeof exerciseId !== 'string') return null;
        else if (known.has(exerciseId)) exercises.push({ exerciseId, sets, repMin, repMax });
        else dropped++;
      }
      if (exercises.length > 0) days.push({ name: name.trim(), colour, exercises });
    }
    return days.length > 0 ? { sender, days, dropped } : null;
  } catch {
    return null;
  }
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The recipient's own Custom Exercise that an incoming one stands for: the same name, ignoring
// capitals and surrounding spaces, and the same equipment. Undefined when they have none.
export function findCustomExercise(
  incoming: LinkCustomExercise,
  own: readonly { id: string; nameEn: string; equipment: string | null; custom: boolean }[],
): string | undefined {
  return own.find((e) => e.custom && sameText(e.nameEn, incoming.name) && e.equipment === incoming.equipment)?.id;
}
