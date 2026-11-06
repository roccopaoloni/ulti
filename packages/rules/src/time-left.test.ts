import { expect, test } from 'vitest';
import { endOfLocalDay, timeLeft } from './index.ts';

const at = (iso: string) => new Date(iso);
const end = at('2026-12-31T12:00:00Z');

test('55 days away shows whole days', () => {
  expect(timeLeft(at('2026-11-06T12:00:00Z'), end)).toEqual({ unit: 'days', count: 55 });
});

test('days round down', () => {
  expect(timeLeft(at('2026-11-06T13:00:00Z'), end)).toEqual({ unit: 'days', count: 54 });
});

test('exactly 48 hours is still days', () => {
  expect(timeLeft(at('2026-12-29T12:00:00Z'), end)).toEqual({ unit: 'days', count: 2 });
});

test('47 hours shows hours, and hours round down', () => {
  expect(timeLeft(at('2026-12-29T13:00:00Z'), end)).toEqual({ unit: 'hours', count: 47 });
  expect(timeLeft(at('2026-12-29T13:30:00Z'), end)).toEqual({ unit: 'hours', count: 46 });
});

test('exactly 1 hour shows 1 hour', () => {
  expect(timeLeft(at('2026-12-31T11:00:00Z'), end)).toEqual({ unit: 'hours', count: 1 });
});

test('under an hour, and at or past the end, shows under an hour', () => {
  expect(timeLeft(at('2026-12-31T11:00:01Z'), end)).toEqual({ unit: 'under-an-hour' });
  expect(timeLeft(at('2026-12-31T12:00:00Z'), end)).toEqual({ unit: 'under-an-hour' });
  expect(timeLeft(at('2027-01-01T00:00:00Z'), end)).toEqual({ unit: 'under-an-hour' });
});

test('the end of a local day is midnight in that time zone, not UTC', () => {
  expect(endOfLocalDay('2026-12-31', 'UTC')).toEqual(at('2027-01-01T00:00:00Z'));
  expect(endOfLocalDay('2026-12-31', 'America/Argentina/Buenos_Aires')).toEqual(at('2027-01-01T03:00:00Z'));
  expect(endOfLocalDay('2026-12-31', 'Pacific/Auckland')).toEqual(at('2026-12-31T11:00:00Z'));
});

test('the day boundary in a non-UTC time zone decides the count', () => {
  const buenosAires = endOfLocalDay('2026-12-31', 'America/Argentina/Buenos_Aires');
  // 02:00 UTC on Jan 1 is 23:00 on Dec 31 in Buenos Aires: one hour left, though UTC has rolled over.
  expect(timeLeft(at('2027-01-01T02:00:00Z'), buenosAires)).toEqual({ unit: 'hours', count: 1 });
  // Auckland has moved on at 11:00 UTC; 10:30 UTC is 23:30 there.
  expect(timeLeft(at('2026-12-31T10:30:00Z'), endOfLocalDay('2026-12-31', 'Pacific/Auckland'))).toEqual({ unit: 'under-an-hour' });
});

test('the end of a local day follows daylight saving', () => {
  expect(endOfLocalDay('2026-10-31', 'Europe/Madrid')).toEqual(at('2026-10-31T23:00:00Z'));
  expect(endOfLocalDay('2026-10-24', 'Europe/Madrid')).toEqual(at('2026-10-24T22:00:00Z'));
});
