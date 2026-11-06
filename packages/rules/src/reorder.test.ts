import { expect, test } from 'vitest';
import { labelSets, moveSet, orderSets } from './index.ts';

const set = (id: string, weightKg: number, extra: { exercise?: string; position?: number; label?: 'warm-up' | 'working' } = {}) => ({ id, weightKg, exercise: 'back-squat', ...extra });
const ids = (sets: { id: string }[]) => sets.map((s) => s.id);

test('Sets without a position keep the order they were logged in', () => {
  expect(ids(orderSets([set('a', 60), set('b', 80), set('c', 100)]))).toEqual(['a', 'b', 'c']);
});

test("an Exercise's Sets are ordered by position, and a Set with none comes after them, in logged order", () => {
  const logged = [set('a', 60, { position: 2 }), set('b', 80, { position: 0 }), set('c', 100, { position: 1 }), set('d', 100), set('e', 100)];
  expect(ids(orderSets(logged))).toEqual(['b', 'c', 'a', 'd', 'e']);
});

test("reordering one Exercise leaves the other Exercises' places in the Session alone", () => {
  const logged = [
    set('a', 60, { position: 1 }),
    set('x', 40, { exercise: 'bench-press' }),
    set('b', 80, { position: 0 }),
    set('y', 50, { exercise: 'bench-press' }),
  ];
  expect(ids(orderSets(logged))).toEqual(['b', 'x', 'a', 'y']);
});

test('dragging a light Set in front of the first Working Set makes it a Warm-up Set by the usual rule', () => {
  const sets = [set('a', 100), set('b', 100), set('c', 60)];
  const moved = moveSet(sets, 'c', 0);
  expect(moved.ids).toEqual(['c', 'a', 'b']);
  expect(labelSets(moved.ids.map((id) => sets.find((s) => s.id === id)!))).toEqual(['warm-up', 'working', 'working']);
});

test('a Set dragged in front of a Warm-up Set becomes a Warm-up Set of the lifter, even the heaviest', () => {
  const sets = [set('a', 40), set('b', 60), set('c', 100)];
  expect(moveSet(sets, 'c', 1)).toEqual({ ids: ['a', 'c', 'b'], warmUp: true });
  expect(moveSet(sets, 'c', 0)).toEqual({ ids: ['c', 'a', 'b'], warmUp: true });
});

test('a Set dragged in front of a hand-set Warm-up Set becomes a Warm-up Set too', () => {
  const sets = [set('a', 100), set('b', 100, { label: 'warm-up' }), set('c', 100)];
  expect(moveSet(sets, 'c', 1).warmUp).toBe(true);
});

test('a Set with a hand-set Working label dragged in front of a Warm-up Set becomes a Warm-up Set', () => {
  const sets = [set('a', 40), set('b', 100), set('c', 60, { label: 'working' })];
  expect(moveSet(sets, 'c', 0).warmUp).toBe(true);
});

test('any other move leaves labels alone', () => {
  const sets = [set('a', 40), set('b', 60), set('c', 100), set('d', 100)];
  expect(moveSet(sets, 'a', 1).warmUp).toBe(false);
  expect(moveSet(sets, 'c', 3)).toEqual({ ids: ['a', 'b', 'd', 'c'], warmUp: false });
  expect(moveSet(sets, 'd', 2)).toEqual({ ids: ['a', 'b', 'd', 'c'], warmUp: false });
});

test('a Warm-up Set dragged behind the Working Sets is not forced to anything', () => {
  const sets = [set('a', 40), set('b', 100), set('c', 100)];
  expect(moveSet(sets, 'a', 2)).toEqual({ ids: ['b', 'c', 'a'], warmUp: false });
});
