import { deleteDB } from 'idb';
import { openTraining, type Training } from './training.ts';

// The Practice Session's throwaway training (Tutorial): a second database, apart from the lifter's,
// whose sends never leave the phone. Real user ids are UUIDs, so this name can't collide with one.
const PRACTICE_USER = 'practice';
const DAY = 86_400_000;

type Clock = { now: () => Date; timeZone: () => string };

// Creating and deleting the database run one after another, so a screen that mounts, unmounts and
// mounts again can't have one run delete what the next just made.
let queue: Promise<unknown> = Promise.resolve();
function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

// Three past Sessions, one a week for the three weeks before today, so none touches this week's
// dot. Bench press has three, which is past Calibration (it has to be: a Session in progress
// counts too, and two or fewer calibrate), and the first 62.5 × 8 beats the last Session's best
// (60 × 8, e1RM 76) without being a jump over the Calibration best (57.5 × 8, +9%). The last
// Session reached the top of Bench press's 6–8 reps, so it recommends 62.5. Barbell row's last
// Session reached the top of 8–10 too, but a Set taken to RIR 0 after a lighter Session makes the
// advice wait, so its rows stay at 50 × 10.
const seed = [
  { weeksAgo: 3, warmUp: 40, bench: [55, 8], row: [45, 8] },
  { weeksAgo: 2, warmUp: 40, bench: [57.5, 8], row: [47.5, 8] },
  { weeksAgo: 1, warmUp: 40, bench: [60, 8], row: [50, 10] },
] as const;

export const PRACTICE_SEED_SESSIONS = seed.length;

// Opens the Practice Session's training with the lifter's catalog entries, units-free kg data,
// profile and a "Practice day" Routine Day (Bench press 3 × 6–8, Barbell row 3 × 8–10).
export function startPractice(real: Training, { dayName, now, timeZone }: Clock & { dayName: string }): Promise<Training> {
  return inTurn(async () => {
    await deleteDB(`ulti-${PRACTICE_USER}`);
    // While seeding, the clock reads the past, a minute later every time; afterwards it is the real one.
    let seeding: number | null = null;
    const practice = await openTraining(PRACTICE_USER, {
      send: async () => ({ rejected: [] }),
      connectivity: new EventTarget(),
      retryAfterMs: 60_000,
      now: () => (seeding === null ? now() : new Date((seeding += 60_000))),
      timeZone,
    });
    const own = await real.profile();
    // Dated before the seeded Sessions, so the lifter's real Weekly Target and bodyweight apply to them.
    const since = '2000-01-01';
    await practice.saveProfileHistory([
      ...(own.sex.at(-1) ? [{ field: 'sex' as const, effectiveFrom: since, value: own.sex.at(-1)!.value }] : []),
      ...(own.bodyweightKg.at(-1) ? [{ field: 'bodyweightKg' as const, effectiveFrom: since, value: own.bodyweightKg.at(-1)!.value }] : []),
      ...(own.weeklyTarget.at(-1) ? [{ field: 'weeklyTarget' as const, effectiveFrom: since, value: own.weeklyTarget.at(-1)!.value }] : []),
    ]);
    await practice.saveExercises((await real.exercises()).filter(({ id }) => id === 'bench-press' || id === 'barbell-row'));
    const id = 'practice-day';
    await practice.saveRoutine([
      {
        id,
        name: dayName,
        colour: 0,
        exercises: [
          { exerciseId: 'bench-press', sets: 3, repMin: 6, repMax: 8 },
          { exerciseId: 'barbell-row', sets: 3, repMin: 8, repMax: 10 },
        ],
      },
    ]);
    for (const { weeksAgo, warmUp, bench, row } of seed) {
      seeding = now().getTime() - weeksAgo * 7 * DAY;
      const session = await practice.startSession(id);
      const log = (exerciseId: string, weightKg: number, reps: number) => practice.logSet(session.id, exerciseId, weightKg, reps, undefined, { confirmedJump: true });
      await log('bench-press', warmUp, 10);
      for (let i = 0; i < 3; i++) await log('bench-press', bench[0], bench[1]);
      let last;
      for (let i = 0; i < 3; i++) last = await log('barbell-row', row[0], row[1]);
      if (weeksAgo === 1) await practice.setRir(last!.id, 0);
      await practice.finishSession(session.id);
    }
    seeding = null;
    return practice;
  });
}

// Closes the Practice Session's training and deletes it.
export function endPractice(practice: Training): Promise<void> {
  return inTurn(() => practice.erase());
}

// A leftover from a tab closed mid-practice is deleted when the Tutorial starts.
export function deleteLeftoverPractice(): Promise<void> {
  return inTurn(() => deleteDB(`ulti-${PRACTICE_USER}`));
}
