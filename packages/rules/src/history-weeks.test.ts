import { expect, test } from 'vitest';
import { deriveScoringEvents, historyWeeks, type Dated, type PersonalRecord } from './index.ts';

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

const targets: Dated<number>[] = [{ effectiveFrom: '2026-09-01', value: 3 }];

function weeksOf(dates: string[], today: string) {
  const events = deriveScoringEvents({ userId: 'ana', sessions: dates.map((date) => session(date)), weeklyTargets: targets });
  return historyWeeks({
    sessions: [...dates].reverse().map((localDate) => ({ localDate })),
    consistency: events.filter((event) => event.kind === 'consistency'),
    records: events.filter((event) => event.kind === 'personal-record'),
    weeklyTargets: targets,
    today,
  });
}

test("weeks run newest first from the current week, with each week's Sessions and dates", () => {
  const weeks = weeksOf(['2026-10-20', '2026-10-22', '2026-10-30'], '2026-10-31');
  expect(weeks.map((week) => [week.week, week.end])).toEqual([
    ['2026-10-26', '2026-11-01'],
    ['2026-10-19', '2026-10-25'],
  ]);
  expect(weeks[1].sessions.map((s) => s.localDate)).toEqual(['2026-10-22', '2026-10-20']);
});

test('a week shows its Sessions against the Weekly Target and its stamp once met', () => {
  const [now, met] = weeksOf(['2026-10-19', '2026-10-21', '2026-10-24', '2026-10-30'], '2026-10-31');
  expect([now.done, now.target, now.stamped]).toEqual([1, 3, false]);
  expect([met.done, met.target, met.stamped]).toEqual([3, 3, true]);
});

test("a week's points are its Consistency Points plus the Progress Points of its Personal Records", () => {
  const [week] = historyWeeks({
    sessions: [{ localDate: '2026-10-21' }],
    consistency: [
      { kind: 'consistency', week: '2026-10-19', weeklyTarget: 3, sessionDates: ['2026-10-21'], consistencyPoints: 40 } as never,
    ],
    records: [{ localDate: '2026-10-21', progressPoints: 30 } as PersonalRecord],
    weeklyTargets: targets,
    today: '2026-10-21',
  });
  expect(week.points).toBe(70);
});

test('weeks with no Sessions between are listed empty, and the current week always shows', () => {
  const weeks = weeksOf(['2026-10-06'], '2026-10-31');
  expect(weeks.map((week) => [week.week, week.sessions.length])).toEqual([
    ['2026-10-26', 0],
    ['2026-10-19', 0],
    ['2026-10-12', 0],
    ['2026-10-05', 1],
  ]);
  expect(weeks[1].target).toBe(3);
});

test('with no Sessions at all there is only the current week', () => {
  expect(weeksOf([], '2026-10-31').map((week) => week.week)).toEqual(['2026-10-26']);
});
