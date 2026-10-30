import { expect, test } from 'vitest';
import { bodyweightPromptDue, incrementInUnits, isProfileValue, kgToUnits, nextMonday, unitsToKg, valueInForce } from './index.ts';

test('weights are stored in kg and shown in the units the user chose', () => {
  expect(kgToUnits(100, 'kg')).toBe(100);
  expect(kgToUnits(100, 'lb')).toBeCloseTo(220.462, 3);
  expect(unitsToKg(225, 'lb')).toBeCloseTo(102.058, 3);
  expect(unitsToKg(82.5, 'kg')).toBe(82.5);
});

test("an Exercise's Increment steps by a loadable amount in the user's units", () => {
  expect(incrementInUnits(2.5, 'kg')).toBe(2.5);
  expect(incrementInUnits(2.5, 'lb')).toBe(5);
  expect(incrementInUnits(5, 'lb')).toBe(10);
});

test('in lb the step rounds to the nearest 2.5 lb plate pair, and never goes below 2.5 lb', () => {
  expect(incrementInUnits(1.25, 'lb')).toBe(2.5);
  expect(incrementInUnits(0.5, 'lb')).toBe(2.5);
  expect(incrementInUnits(10, 'lb')).toBe(22.5);
});

test('a weight typed in lb comes back as the same number of lb', () => {
  expect(kgToUnits(unitsToKg(135, 'lb'), 'lb')).toBeCloseTo(135, 10);
});

test('a Weekly Target is a whole number from 2 to 6', () => {
  expect([1, 2, 6, 7, 3.5, '4'].map((value) => isProfileValue('weeklyTarget', value))).toEqual([
    false,
    true,
    true,
    false,
    false,
    false,
  ]);
});

test('sex is male, female or prefer not to say, and bodyweight a plausible number of kg', () => {
  expect(['male', 'female', 'unspecified', 'other', 1].map((value) => isProfileValue('sex', value))).toEqual([
    true,
    true,
    true,
    false,
    false,
  ]);
  expect([62.5, 20, 500, 0, -3, 501, '80', NaN].map((value) => isProfileValue('bodyweightKg', value))).toEqual([
    true,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
  ]);
  expect(isProfileValue('height', 180)).toBe(false);
});

test('the app asks for bodyweight again two weeks after the last time it asked', () => {
  expect(bodyweightPromptDue('2026-10-07', '2026-10-20')).toBe(false);
  expect(bodyweightPromptDue('2026-10-07', '2026-10-21')).toBe(true);
  expect(bodyweightPromptDue('2026-10-07', '2027-01-01')).toBe(true);
});

const anasTarget = [
  { effectiveFrom: '2026-10-05', value: 3 },
  { effectiveFrom: '2026-10-26', value: 4 },
];

test('the value in force on a date is the latest entry that has started by then', () => {
  expect(valueInForce(anasTarget, '2026-10-05')).toBe(3);
  expect(valueInForce(anasTarget, '2026-10-25')).toBe(3);
  expect(valueInForce(anasTarget, '2026-10-26')).toBe(4);
  expect(valueInForce(anasTarget, '2027-01-01')).toBe(4);
});

test('no value is in force before the first entry', () => {
  expect(valueInForce(anasTarget, '2026-10-04')).toBeUndefined();
  expect(valueInForce([], '2026-10-04')).toBeUndefined();
});

test('the order the entries arrive in does not matter', () => {
  expect(valueInForce([...anasTarget].reverse(), '2026-10-27')).toBe(4);
});

test('a Weekly Target changed on a Saturday applies from the Monday after', () => {
  expect(nextMonday('2026-10-24')).toBe('2026-10-26');
});

test('a Weekly Target changed on a Monday waits a whole week, and one changed on a Sunday waits a day', () => {
  expect(nextMonday('2026-10-19')).toBe('2026-10-26');
  expect(nextMonday('2026-10-25')).toBe('2026-10-26');
});

test('next Monday crosses a month and a year', () => {
  expect(nextMonday('2026-10-29')).toBe('2026-11-02');
  expect(nextMonday('2026-12-30')).toBe('2027-01-04');
});

test('a lowered Weekly Target stays the old one until the Monday it starts', () => {
  const history = [
    { effectiveFrom: '2026-10-05', value: 5 },
    { effectiveFrom: nextMonday('2026-10-24'), value: 3 },
  ];
  expect(valueInForce(history, '2026-10-25')).toBe(5);
  expect(valueInForce(history, '2026-10-26')).toBe(3);
});
