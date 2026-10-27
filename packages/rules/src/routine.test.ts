import { expect, test } from 'vitest';
import { nextRoutineDay, suggestedWeeklyTarget } from './index.ts';

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
