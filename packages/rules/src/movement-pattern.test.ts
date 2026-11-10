import { expect, test } from 'vitest';
import { isCompound, isMovementPattern, movementPatterns } from './index.ts';

test('every Movement Pattern but isolation is compound, and a Custom Exercise (no pattern) counts as isolation', () => {
  expect(movementPatterns.filter(isCompound)).toEqual(['squat', 'hinge', 'horizontal-press', 'vertical-press', 'horizontal-pull', 'vertical-pull']);
  expect([isCompound('isolation'), isCompound(null), isCompound(undefined)]).toEqual([false, false, false]);
});

test('only the seven patterns are Movement Patterns', () => {
  expect(['hinge', 'isolation', 'press', '', null].map(isMovementPattern)).toEqual([true, true, false, false, false]);
});
