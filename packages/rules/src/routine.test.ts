import { expect, test } from 'vitest';
import { completeRoutine, dayColour, moveItem, nextDayColour, nextRoutineDay, plannedRows, suggestedWeeklyTarget, withDayColours } from './index.ts';

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

test('with no Session from the Routine yet, the next one is its first', () => {
  expect(nextRoutineDay(days, undefined)).toBe('push');
});

test('the next Session is the one after the last one done', () => {
  expect(nextRoutineDay(days, 'push')).toBe('pull');
});

test('after the last Session of the Routine comes its first again', () => {
  expect(nextRoutineDay(days, 'legs')).toBe('push');
});

test('if the last Session done is no longer in the Routine, the next one is its first', () => {
  expect(nextRoutineDay(days, 'arms')).toBe('push');
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
