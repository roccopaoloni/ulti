import { expect, test } from 'vitest';
import { periodEnd } from './index.ts';

test('a week ends on its Sunday', () => {
  expect(periodEnd('week', '2026-11-04')).toBe('2026-11-08');
  expect(periodEnd('week', '2026-11-08')).toBe('2026-11-08');
  expect(periodEnd('week', '2026-11-02')).toBe('2026-11-08');
});

test('a week can end in the next month or year', () => {
  expect(periodEnd('week', '2026-12-29')).toBe('2027-01-03');
});

test('a month ends on its last day, leap February included', () => {
  expect(periodEnd('month', '2026-11-06')).toBe('2026-11-30');
  expect(periodEnd('month', '2026-12-01')).toBe('2026-12-31');
  expect(periodEnd('month', '2026-02-10')).toBe('2026-02-28');
  expect(periodEnd('month', '2028-02-10')).toBe('2028-02-29');
});

test('a year ends on 31 December', () => {
  expect(periodEnd('year', '2026-11-06')).toBe('2026-12-31');
  expect(periodEnd('year', '2026-12-31')).toBe('2026-12-31');
});
