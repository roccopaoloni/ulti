import { expect, test } from 'vitest';
import { deriveScoringEvents, historyMonth, type Dated } from './index.ts';

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

function monthOf(month: string, dates: string[]) {
  const events = deriveScoringEvents({ userId: 'ana', sessions: dates.map((date) => session(date)), weeklyTargets: targets });
  return historyMonth({
    month,
    sessions: dates.map((localDate) => ({ localDate })),
    consistency: events.filter((event) => event.kind === 'consistency'),
  });
}

test('the grid runs whole Monday-to-Sunday weeks, flagging the days that are not in the month', () => {
  // October 2026 starts on a Thursday and ends on a Saturday.
  const { weeks } = monthOf('2026-10', []);
  expect(weeks.map((week) => week.week)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  expect(weeks.every((week) => week.days.length === 7)).toBe(true);
  expect(weeks[0].days.map((day) => [day.date, day.inMonth])).toEqual([
    ['2026-09-28', false],
    ['2026-09-29', false],
    ['2026-09-30', false],
    ['2026-10-01', true],
    ['2026-10-02', true],
    ['2026-10-03', true],
    ['2026-10-04', true],
  ]);
  expect(weeks[4].days.map((day) => day.inMonth)).toEqual([true, true, true, true, true, true, false]);
});

test('a month that starts on a Monday and ends on a Sunday has no days outside it', () => {
  // February 2027 starts on a Monday and ends on a Sunday.
  const { weeks } = monthOf('2027-02', []);
  expect(weeks.map((week) => week.week)).toEqual(['2027-02-01', '2027-02-08', '2027-02-15', '2027-02-22']);
  expect(weeks.flatMap((week) => week.days).every((day) => day.inMonth)).toBe(true);
});

test("each day carries that day's Sessions, and a day with two keeps both in the order given", () => {
  const { weeks } = monthOf('2026-10', ['2026-10-14', '2026-10-14', '2026-10-15']);
  const days = weeks.flatMap((week) => week.days);
  expect(days.find((day) => day.date === '2026-10-14')!.sessions).toHaveLength(2);
  expect(days.find((day) => day.date === '2026-10-15')!.sessions).toHaveLength(1);
  expect(days.find((day) => day.date === '2026-10-16')!.sessions).toHaveLength(0);
});

test("a day outside the month shows none of its Sessions: they belong to the other month's grid", () => {
  const { weeks, sessions } = monthOf('2026-10', ['2026-09-30', '2026-10-01']);
  expect(weeks[0].days.map((day) => day.sessions.length)).toEqual([0, 0, 0, 1, 0, 0, 0]);
  expect(sessions).toBe(1);
});

test('a week is stamped once its Sessions met the Weekly Target', () => {
  const { weeks } = monthOf('2026-10', ['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21']);
  expect(weeks.map((week) => [week.week, week.stamped])).toEqual([
    ['2026-09-28', false],
    ['2026-10-05', false],
    ['2026-10-12', true],
    ['2026-10-19', false],
    ['2026-10-26', false],
  ]);
});

test('a week spanning two months is stamped in both, and counts as one Week Stamp, in the month it ends in', () => {
  // Mon 26 Oct to Sun 1 Nov: two Sessions in October, one in November.
  const dates = ['2026-10-26', '2026-10-28', '2026-11-01'];
  const october = monthOf('2026-10', dates);
  const november = monthOf('2026-11', dates);
  expect(october.weeks.at(-1)!.stamped).toBe(true);
  expect(november.weeks[0].stamped).toBe(true);
  expect([october.sessions, october.stamps]).toEqual([2, 0]);
  expect([november.sessions, november.stamps]).toEqual([1, 1]);
});

test('the month counts its Sessions and the Week Stamps of the weeks that end in it', () => {
  const dates = ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-14', '2026-10-16', '2026-10-20'];
  const month = monthOf('2026-10', dates);
  expect([month.sessions, month.stamps]).toEqual([7, 2]);
});
