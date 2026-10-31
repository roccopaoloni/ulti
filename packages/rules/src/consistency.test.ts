import { expect, test } from 'vitest';
import { deriveScoringEvents, sessionConsistencyPoints, streak, weekStamps, type Dated, type TrainingHistory } from './index.ts';

// A Session of `workingSets` equal-weight Sets of one Exercise, so every Set is a Working Set.
function session(localDate: string, workingSets = 6) {
  return {
    localDate,
    sets: Array.from({ length: workingSets }, (_, i) => ({
      id: `${localDate}-${i}`,
      exercise: 'back-squat',
      custom: false,
      weightKg: 100,
      reps: 5,
    })),
  };
}

function ana(sessions: ReturnType<typeof session>[], weeklyTargets: Dated<number>[] = [{ effectiveFrom: '2026-10-05', value: 3 }]): TrainingHistory {
  return { userId: 'ana', sessions, weeklyTargets };
}

const consistencyOf = (history: TrainingHistory) =>
  deriveScoringEvents(history).filter((event) => event.kind === 'consistency');

test('each qualifying Session is worth its share of the weekly amount, and Sessions beyond the Weekly Target nothing', () => {
  const history = ana([session('2026-10-19'), session('2026-10-20', 2), session('2026-10-21'), session('2026-10-22'), session('2026-10-23')]);

  expect(sessionConsistencyPoints(history)).toEqual([40, 0, 40, 40, 0]);
});

// The weekly amount is 120 (tuned in #31), so a Weekly Target of 3 pays 40 a Session.
test('with a Weekly Target of 3, two qualifying Sessions in a week earn two thirds of the weekly amount', () => {
  const events = consistencyOf(ana([session('2026-10-19'), session('2026-10-21')]));

  expect(events).toEqual([
    expect.objectContaining({
      id: 'ana:consistency:2026-10-19',
      week: '2026-10-19',
      weeklyTarget: 3,
      sessionDates: ['2026-10-19', '2026-10-21'],
      consistencyPoints: 80,
    }),
  ]);
});

test('the same weekly amount is available at every Weekly Target from 2 to 6', () => {
  const full = (target: number) =>
    consistencyOf(
      ana(
        ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'].slice(0, target).map((day) => session(day)),
        [{ effectiveFrom: '2026-10-05', value: target }],
      ),
    ).map((e) => e.consistencyPoints);

  expect([2, 3, 4, 5, 6].map(full)).toEqual([[120], [120], [120], [120], [120]]);
  // One Session of the target is the matching share: 60 of 120 at 2, 20 of 120 at 6.
  expect(
    [2, 6].map((target) => consistencyOf(ana([session('2026-10-19')], [{ effectiveFrom: '2026-10-05', value: target }]))[0].consistencyPoints),
  ).toEqual([60, 20]);
});

test('a Session needs six Working Sets to qualify: Warm-up Sets and a fifth Set do not count', () => {
  const ramp = (localDate: string) => ({
    localDate,
    // Three lighter Sets are Warm-ups, leaving only three Working Sets.
    sets: [40, 60, 80, 100, 100, 100].map((weightKg, i) => ({ id: `${localDate}-${i}`, exercise: 'back-squat', custom: false, weightKg, reps: 5 })),
  });
  // Working Sets spread over two Exercises add up, and a Custom Exercise counts too.
  const mixed = {
    localDate: '2026-10-22',
    sets: [
      ...session('2026-10-22', 3).sets,
      ...[1, 2, 3].map((i) => ({ id: `c${i}`, exercise: 'my-curl', custom: true, weightKg: 20, reps: 10 })),
    ],
  };

  const events = consistencyOf(ana([ramp('2026-10-19'), session('2026-10-20', 5), mixed]));

  expect(events.map((e) => e.sessionDates)).toEqual([['2026-10-22']]);
});

test('weeks run Monday to Sunday by local date: a Sunday-night Session belongs to the week that ends, a Monday one to the next', () => {
  const events = consistencyOf(ana([session('2026-10-25'), session('2026-10-26')]));

  expect(events.map((e) => [e.week, e.sessionDates, e.consistencyPoints])).toEqual([
    ['2026-10-19', ['2026-10-25'], 40],
    ['2026-10-26', ['2026-10-26'], 40],
  ]);
});

test('a Weekly Target changed on a Wednesday applies from next Monday, and a week uses the target in force that week', () => {
  const sessions = ['2026-10-19', '2026-10-27', '2026-10-28'].map((day) => session(day));
  const lowered = [
    { effectiveFrom: '2026-10-05', value: 4 },
    { effectiveFrom: '2026-10-21', value: 2 },
  ];

  const events = consistencyOf(ana(sessions, lowered));

  // The change dated Wednesday the 21st leaves the week of the 19th at 4, and the week of the 26th at 2.
  expect(events.map((e) => [e.week, e.weeklyTarget, e.consistencyPoints])).toEqual([
    ['2026-10-19', 4, 30],
    ['2026-10-26', 2, 120],
  ]);
});

test('Sessions before any Weekly Target is set earn nothing, and the first target covers the week it was set in', () => {
  const sessions = [session('2026-10-12'), session('2026-10-21')];

  const events = consistencyOf(ana(sessions, [{ effectiveFrom: '2026-10-21', value: 3 }]));

  expect(events.map((e) => [e.week, e.consistencyPoints])).toEqual([['2026-10-19', 40]]);
  // A first target that starts on the following Monday does not reach back.
  expect(consistencyOf(ana(sessions, [{ effectiveFrom: '2026-10-26', value: 3 }]))).toEqual([]);
});

// Four weeks, oldest first, each with the given number of Sessions against a Weekly Target of 2.
function weeks(...done: [number, number, number, number]) {
  const days = [
    ['2026-09-28', '2026-09-29', '2026-09-30'],
    ['2026-10-05', '2026-10-06', '2026-10-07'],
    ['2026-10-12', '2026-10-13', '2026-10-14'],
    ['2026-10-19', '2026-10-20', '2026-10-21'],
  ];
  const sessions = done.flatMap((count, week) => days[week].slice(0, count).map((day) => session(day)));
  return consistencyOf(ana(sessions, [{ effectiveFrom: '2026-09-01', value: 2 }]));
}

test('a week that meets the Weekly Target earns a Week Stamp, and one short of it does not', () => {
  expect(weekStamps(weeks(2, 1, 3, 2))).toEqual(['2026-09-28', '2026-10-12', '2026-10-19']);
});

test('the Streak counts consecutive Week Stamps up to the last finished week, and this week joins it once it has its own stamp', () => {
  const stamped = weeks(2, 2, 2, 1);
  // Today is Wednesday 21 Oct: the week of the 19th is still running, so it neither breaks nor extends the Streak.
  expect(streak(stamped, '2026-10-21')).toBe(3);
  expect(streak(weeks(2, 2, 2, 2), '2026-10-21')).toBe(4);
  // A missed finished week ends it.
  expect(streak(weeks(2, 1, 2, 2), '2026-10-21')).toBe(2);
  expect(streak(weeks(2, 2, 1, 0), '2026-10-21')).toBe(0);
  // A new week with no Session yet has not broken anything.
  expect(streak(weeks(1, 2, 2, 2), '2026-10-27')).toBe(3);
  // But a finished week without a stamp has, even if the new week is going well.
  expect(streak(weeks(2, 2, 2, 1), '2026-10-27')).toBe(0);
});

test('deriving twice from the same history gives identical events, each stamped with a rules version', () => {
  const history = ana([session('2026-10-19'), session('2026-10-21')]);

  expect(deriveScoringEvents(history)).toEqual(deriveScoringEvents(history));
  expect(consistencyOf(history)[0].rulesVersion).toBe(2);
});

test('Sessions beyond the Weekly Target earn nothing extra', () => {
  const events = consistencyOf(
    ana([session('2026-10-19'), session('2026-10-20'), session('2026-10-22'), session('2026-10-23'), session('2026-10-24')]),
  );

  expect(events.map((e) => [e.sessionDates, e.consistencyPoints])).toEqual([[['2026-10-19', '2026-10-20', '2026-10-22'], 120]]);
});

test('a week lists every qualifying Session it had, including those beyond the Weekly Target', () => {
  const events = consistencyOf(
    ana([session('2026-10-19'), session('2026-10-20'), session('2026-10-22'), session('2026-10-23'), session('2026-10-24', 5)]),
  );

  expect(events.map((e) => e.trainedDates)).toEqual([['2026-10-19', '2026-10-20', '2026-10-22', '2026-10-23']]);
});
