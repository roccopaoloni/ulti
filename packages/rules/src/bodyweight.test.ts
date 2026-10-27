import { expect, test } from 'vitest';
import { deriveScoringEvents, type PersonalRecord, type Session } from './index.ts';

// Ana's pull-up Sets: weightKg is the weight added to her bodyweight (0 for a plain pull-up).
let next = 0;
const pullUp = (addedKg: number, reps: number) => ({
  id: `pull-up-${++next}`,
  exercise: 'pull-up',
  custom: false,
  bodyweight: true,
  weightKg: addedKg,
  reps,
});
const session = (localDate: string, ...sets: ReturnType<typeof pullUp>[]): Session => ({ localDate, sets });
const history = (bodyweightKg: { effectiveFrom: string; value: number }[], ...sessions: Session[]) => ({
  userId: 'ana',
  sessions,
  weeklyTargets: [],
  bodyweightKg,
});

const recordsOf = (training: ReturnType<typeof history>) =>
  deriveScoringEvents(training).filter((event): event is PersonalRecord => event.kind === 'personal-record');

test('a pull-up Personal Record counts her bodyweight plus the added weight', () => {
  const record = pullUp(4, 6);
  const events = deriveScoringEvents(
    history(
      [{ effectiveFrom: '2026-09-01', value: 80 }],
      session('2026-10-05', pullUp(0, 6)),
      session('2026-10-12', pullUp(0, 6)),
      session('2026-10-19', record),
    ),
  );

  // Epley on 80 kg: 80 × 1.2 = 96. Then 80 + 4 = 84 kg: 84 × 1.2 = 100.8, a 5% gain.
  expect(events).toEqual([
    expect.objectContaining({
      id: `ana:personal-record:${record.id}`,
      exercise: 'pull-up',
      previousE1rm: 96,
      newE1rm: 100.8,
      percentGain: 5,
      bodyweightKg: 80,
      progressPoints: 50,
    }),
  ]);
});

test('the load uses the check-in in force on each day of the last four weeks, not the latest one', () => {
  const record = pullUp(4, 6);
  const [event] = recordsOf(
    history(
      // 82 kg until 5 Oct, then 78 kg: on 19 Oct the last 28 days are 14 at each, an average of 80.
      [
        { effectiveFrom: '2026-09-01', value: 82 },
        { effectiveFrom: '2026-10-06', value: 78 },
      ],
      session('2026-10-05', pullUp(0, 6)),
      session('2026-10-12', pullUp(0, 6)),
      session('2026-10-19', record),
    ),
  );

  // 80 + 4 = 84 kg × 1.2 = 100.8, against her best of 82 kg × 1.2 = 98.4 on 5 Oct.
  expect(event).toMatchObject({ setId: record.id, bodyweightKg: 80 });
  expect(event.newE1rm).toBeCloseTo(100.8);
  expect(event.previousE1rm).toBeCloseTo(98.4);
});

test('a one-day 2 kg swing in bodyweight cannot make a repeated Set a real Personal Record', () => {
  const [event] = recordsOf(
    history(
      [
        { effectiveFrom: '2026-09-01', value: 80 },
        // Ana weighs 82 kg on the day of the third Session only.
        { effectiveFrom: '2026-10-19', value: 82 },
        { effectiveFrom: '2026-10-20', value: 80 },
      ],
      session('2026-10-05', pullUp(10, 6)),
      session('2026-10-12', pullUp(10, 6)),
      session('2026-10-19', pullUp(10, 6)),
    ),
  );

  // Taken at face value the swing would score 92 × 1.2 = 110.4 against 108, a 2.2% record. Averaged
  // over 28 days the load is 90.07 kg, an e1RM of 108.09: a gain of 0.08%.
  expect(event.percentGain).toBe(0.08);
});

test('a bodyweight Exercise is not scored before the lifter has any bodyweight check-in', () => {
  const sessions = [session('2026-10-05', pullUp(0, 6)), session('2026-10-12', pullUp(0, 6)), session('2026-10-19', pullUp(10, 6))];
  expect(deriveScoringEvents(history([], ...sessions))).toEqual([]);
});
