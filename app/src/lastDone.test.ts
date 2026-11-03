import { expect, test } from 'vitest';
import { lastDoneLabel } from './lastDone.ts';

test('a Day done within the last week shows the weekday, an older one a short date, and one never done says so', () => {
  expect(lastDoneLabel('en', '2026-10-29', '2026-11-03', 'Never')).toBe('Thu');
  expect(lastDoneLabel('en', '2026-10-22', '2026-11-03', 'Never')).toBe('Oct 22');
  expect(lastDoneLabel('es', '2026-10-22', '2026-11-03', 'Nunca')).toBe('22 oct');
  expect(lastDoneLabel('en', null, '2026-11-03', 'Never')).toBe('Never');
});
