import { expect, test } from 'vitest';
import { completeRoutine, dayColour, moveItem, nextDayColour, plannedRows, rowsWithAdvice, routineDayChoices, suggestedRoutineDay, suggestedWeeklyTarget, withDayColours, type RoutineDay } from './index.ts';

const blank = (ids: string[]) => ids.map((id) => ({ id, name: id, exercises: [] }));

test('Routine Days made without colours get the rotation in order, repeating after five', () => {
  expect(withDayColours(blank(['a', 'b', 'c', 'd', 'e', 'f'])).map((day) => day.colour)).toEqual([0, 1, 2, 3, 4, 0]);
});

test("a Day's colour follows it when Days are reordered", () => {
  const moved = moveItem(withDayColours(blank(['push', 'pull', 'legs'])), 0, 2);
  expect(moved.map((day, i) => [day.id, dayColour(moved, i)])).toEqual([['pull', 1], ['legs', 2], ['push', 0]]);
});

test('an old Routine with no colours still gives each Day a distinct one, by position', () => {
  const old = blank(['push', 'pull']);
  expect([dayColour(old, 0), dayColour(old, 1)]).toEqual([0, 1]);
});

test('a new Day takes the first colour no Day has, so removing one frees its colour', () => {
  const four = withDayColours(blank(['a', 'b', 'c', 'd']));
  expect(nextDayColour(four)).toBe(4);
  expect(nextDayColour(four.filter((day) => day.id !== 'b'))).toBe(1);
});

test('with every colour taken, a new Day repeats the rotation', () => {
  expect(nextDayColour(withDayColours(blank(['a', 'b', 'c', 'd', 'e'])))).toBe(0);
});

test('saving a whole Routine keeps the Days colours', () => {
  const day = { id: 'a', name: ' Push ', colour: 3, exercises: [{ exerciseId: 'bench', sets: 3, repMin: 8, repMax: 12 }] };
  expect(completeRoutine([day])).toEqual([{ ...day, name: 'Push' }]);
});

test('a Routine of three Sessions suggests a Weekly Target of 3', () => {
  expect(suggestedWeeklyTarget(3)).toBe(3);
});

test('the suggested Weekly Target stays within 2 to 6', () => {
  expect(suggestedWeeklyTarget(1)).toBe(2);
  expect(suggestedWeeklyTarget(0)).toBe(2);
  expect(suggestedWeeklyTarget(7)).toBe(6);
});

// Push, Pull, Legs.
const days = ['push', 'pull', 'legs'];

const at = (dayId: string, startedAt: string) => ({ dayId, startedAt });

test('with no Session from the Routine yet, the Suggested Day is its first', () => {
  expect(suggestedRoutineDay(days, [])).toBe('push');
});

test('the Suggested Day is the Routine Day done longest ago', () => {
  const done = [at('push', '2026-10-01'), at('pull', '2026-10-03'), at('legs', '2026-10-02')];
  expect(suggestedRoutineDay(days, done)).toBe('push');
  expect(suggestedRoutineDay(days, [...done, at('push', '2026-10-04')])).toBe('legs');
});

test('a Day done twice counts from its latest Session', () => {
  const done = [at('push', '2026-10-01'), at('push', '2026-10-05'), at('pull', '2026-10-02'), at('legs', '2026-10-03')];
  expect(suggestedRoutineDay(days, done)).toBe('pull');
});

test('a Routine Day never done counts as the oldest', () => {
  expect(suggestedRoutineDay(days, [at('push', '2026-10-01'), at('legs', '2026-10-02')])).toBe('pull');
});

test('Days never done tie, and the tie goes to Routine order', () => {
  expect(suggestedRoutineDay(days, [at('push', '2026-10-01')])).toBe('pull');
});

test('with Days done in order, it matches the rotation: the Day after the last one, wrapping around', () => {
  expect(suggestedRoutineDay(days, [at('push', '2026-10-01')])).toBe('pull');
  expect(suggestedRoutineDay(days, [at('push', '2026-10-01'), at('pull', '2026-10-02')])).toBe('legs');
  expect(suggestedRoutineDay(days, [at('push', '2026-10-01'), at('pull', '2026-10-02'), at('legs', '2026-10-03')])).toBe('push');
});

test('Sessions from a Day no longer in the Routine are ignored', () => {
  expect(suggestedRoutineDay(days, [at('arms', '2026-10-09'), at('push', '2026-10-01')])).toBe('pull');
});

const planned = (id: string, exercises: number, colour?: number): RoutineDay => ({
  id,
  name: id,
  colour,
  exercises: Array.from({ length: exercises }, () => ({ exerciseId: 'x', sets: 3, repMin: 8, repMax: 12 })),
});
const on = (dayId: string, startedAt: string) => ({ dayId, startedAt, localDate: startedAt.slice(0, 10) });

test('the Days to pick from start with the Suggested Day, then follow in Routine order', () => {
  const routine = [planned('push', 2), planned('pull', 3), planned('legs', 1), planned('arms', 1)];
  const choices = routineDayChoices(routine, [on('push', '2026-10-03T08:00:00Z'), on('pull', '2026-10-01T08:00:00Z'), on('legs', '2026-10-02T08:00:00Z'), on('arms', '2026-10-04T08:00:00Z')]);
  expect(choices.map((choice) => choice.day.id)).toEqual(['pull', 'push', 'legs', 'arms']);
  expect(choices.map((choice) => choice.suggested)).toEqual([true, false, false, false]);
});

test("each Day to pick shows its colour, its Exercise count and the date of the latest Session started from it, or none if never done", () => {
  const routine = [planned('push', 2, 3), planned('pull', 3)];
  const choices = routineDayChoices(routine, [on('push', '2026-10-01T08:00:00Z'), on('push', '2026-10-05T08:00:00Z'), on('arms', '2026-10-09T08:00:00Z')]);
  expect(choices.map(({ day, colour, exerciseCount, lastDone }) => [day.id, colour, exerciseCount, lastDone])).toEqual([
    ['pull', 1, 3, null],
    ['push', 3, 2, '2026-10-05'],
  ]);
});

test('a Routine Day planning 3 Sets shows 3 rows, the ones past the last Session repeating its last Set', () => {
  const last = [{ weightKg: 100, reps: 8 }, { weightKg: 105, reps: 6 }];
  expect(plannedRows(last, 3)).toEqual([...last, { weightKg: 105, reps: 6 }]);
});

test('the last Session having more Sets than the plan keeps them all', () => {
  const last = [{ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 9 }, { weightKg: 60, reps: 8 }];
  expect(plannedRows(last, 2)).toEqual(last);
});

test('with no earlier Session the planned Sets are empty rows, and with no plan there are none', () => {
  expect(plannedRows([], 3)).toEqual([undefined, undefined, undefined]);
  expect(plannedRows([], undefined)).toEqual([]);
});

test('moving an item takes it out of its place and puts it at the new one', () => {
  expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
});

test('moving an item to where it is changes nothing, a place past either end is the end, and the input is left alone', () => {
  const list = ['a', 'b', 'c'];
  expect(moveItem(list, 1, 1)).toEqual(['a', 'b', 'c']);
  expect(moveItem(list, 0, 9)).toEqual(['b', 'c', 'a']);
  expect(moveItem(list, 2, -4)).toEqual(['c', 'a', 'b']);
  expect(list).toEqual(['a', 'b', 'c']);
});

const row = { exerciseId: 'bench-press', sets: 3, repMin: 8, repMax: 12 };

test('a Routine draft that is whole is the Routine, with the Day names trimmed', () => {
  expect(completeRoutine([{ id: 'push', name: ' Push ', exercises: [row] }])).toEqual([{ id: 'push', name: 'Push', exercises: [row] }]);
});

test('a draft with no Days, an unnamed Day, an empty Day, a row with no Exercise or a backwards Rep Range is not a Routine yet', () => {
  const day = { id: 'push', name: 'Push', exercises: [row] };
  expect(completeRoutine([])).toBeNull();
  expect(completeRoutine([{ ...day, name: '  ' }])).toBeNull();
  expect(completeRoutine([{ ...day, exercises: [] }])).toBeNull();
  expect(completeRoutine([{ ...day, exercises: [{ ...row, exerciseId: '' }] }])).toBeNull();
  expect(completeRoutine([{ ...day, exercises: [{ ...row, repMin: 12, repMax: 8 }] }])).toBeNull();
  expect(completeRoutine([day, { ...day, id: 'pull', exercises: [] }])).toBeNull();
});

test('go-heavier changes only the Working Set rows, the Warm-up keeping the last Session numbers', () => {
  const last = [{ weightKg: 40, reps: 10 }, { weightKg: 60, reps: 8 }, { weightKg: 60, reps: 8 }, { weightKg: 60, reps: 8 }];
  expect(rowsWithAdvice(last, { weightKg: 62.5, reps: 6 })).toEqual([{ weightKg: 40, reps: 10 }, ...Array(3).fill({ weightKg: 62.5, reps: 6 })]);
});

test('a Stall changes only the Working Set rows too', () => {
  const last = [{ weightKg: 40, reps: 10 }, { weightKg: 60, reps: 6 }, { weightKg: 60, reps: 5 }];
  expect(rowsWithAdvice(last, { weightKg: 55, reps: 6 })).toEqual([{ weightKg: 40, reps: 10 }, { weightKg: 55, reps: 6 }, { weightKg: 55, reps: 6 }]);
});

test('a last Session with no Warm-up gives every row the recommended numbers', () => {
  const last = [{ weightKg: 60, reps: 8 }, { weightKg: 60, reps: 8 }];
  expect(rowsWithAdvice(last, { weightKg: 62.5, reps: 6 })).toEqual([{ weightKg: 62.5, reps: 6 }, { weightKg: 62.5, reps: 6 }]);
});

test("a lifter's own Warm-up label on a last Set keeps that row as it was", () => {
  const last = [{ weightKg: 60, reps: 8, label: 'warm-up' as const }, { weightKg: 60, reps: 8 }];
  expect(rowsWithAdvice(last, { weightKg: 62.5, reps: 6 })).toEqual([last[0], { weightKg: 62.5, reps: 6 }]);
});
