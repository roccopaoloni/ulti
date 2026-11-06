import { expect, test } from 'vitest';
import { rankUpReady } from './rankUpReady.ts';

const points = { seasonPoints: 120, scoring: {} };

test('a phone that has seen a Rank decides from what it holds, without waiting for the server', () => {
  expect(rankUpReady({ ...points, seen: { tier: 'gold', division: 3 }, settled: false })).toBe(true);
});

test('a phone that has never seen a Rank waits for the server, so an empty history is not a Rank', () => {
  expect(rankUpReady({ ...points, seen: null, settled: false })).toBe(false);
  expect(rankUpReady({ ...points, seen: null, settled: true })).toBe(true);
});

test('nothing is decided before the phone has loaded its own points', () => {
  expect(rankUpReady({ seasonPoints: null, scoring: null, seen: { tier: 'gold', division: 3 }, settled: true })).toBe(false);
  expect(rankUpReady({ seasonPoints: 5, scoring: null, seen: null, settled: true })).toBe(false);
});
