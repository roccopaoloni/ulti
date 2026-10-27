import { expect, test } from 'vitest';
import { stepValue } from './index.ts';

test("the keypad's + and − step a weight by the Exercise's Increment", () => {
  expect(stepValue(100, 2.5, 1)).toBe(102.5);
  expect(stepValue(100, 2.5, -1)).toBe(97.5);
});

test('reps step by 1', () => {
  expect(stepValue(5, 1, 1)).toBe(6);
});

test('a step never goes below zero', () => {
  expect(stepValue(1, 2.5, -1)).toBe(0);
});

test('a step keeps the decimals clean', () => {
  expect(stepValue(0.1, 0.2, 1)).toBe(0.3);
});
