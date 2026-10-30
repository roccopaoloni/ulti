import { expect, test } from 'vitest';
import { labelSets, predictLabels, workingSets } from './index.ts';

const kg = (...weights: number[]) => weights.map((weightKg) => ({ weightKg }));

test("Ana's ramp to 100 kg labels the lighter Sets Warm-up Sets and the rest Working Sets", () => {
  expect(labelSets(kg(40, 60, 80, 100, 100, 100))).toEqual(['warm-up', 'warm-up', 'warm-up', 'working', 'working', 'working']);
});

test('a final warm-up at 70–85% of the top weight is still a Warm-up Set', () => {
  expect(labelSets(kg(60, 70, 85, 100, 100))).toEqual(['warm-up', 'warm-up', 'warm-up', 'working', 'working']);
});

test('a Set within 10% of the top weight is a Working Set, and so is everything after it', () => {
  expect(labelSets(kg(60, 90, 100))).toEqual(['warm-up', 'working', 'working']);
});

test('back-off Sets after the top Set stay Working Sets', () => {
  expect(labelSets(kg(60, 100, 80, 80))).toEqual(['warm-up', 'working', 'working', 'working']);
});

test('a Session where every Set is the same weight has only Working Sets', () => {
  expect(labelSets(kg(70, 70, 70))).toEqual(['working', 'working', 'working']);
});

test('a lighter Deload Week Session is labelled against its own heaviest weight', () => {
  // Ana usually squats 100 kg; in a Deload Week she tops out at 90 kg.
  expect(labelSets(kg(50, 70, 90, 90, 90))).toEqual(['warm-up', 'warm-up', 'working', 'working', 'working']);
});

test('the lifter can flip a label with one tap, in either direction', () => {
  expect(labelSets([{ weightKg: 60, label: 'working' }, { weightKg: 100 }, { weightKg: 90, label: 'warm-up' }])).toEqual([
    'working',
    'working',
    'warm-up',
  ]);
});

test("a row not logged yet shows the label it would get once the rest of the plan is done: Ana's 40 kg row before a ramp to 100 kg is a Warm-up", () => {
  expect(predictLabels([], kg(40, 60, 80, 100))).toEqual(['warm-up', 'warm-up', 'warm-up', 'working']);
});

test('the prediction follows the weight: the same row at 100 kg is a Working Set', () => {
  expect(predictLabels(kg(40), kg(100, 100))).toEqual(['working', 'working']);
});

test('the prediction counts the Sets already logged', () => {
  expect(predictLabels(kg(100), kg(60))).toEqual(['working']);
});

test('a row the lifter tapped keeps their choice whatever its weight', () => {
  expect(predictLabels([], [{ weightKg: 100, label: 'warm-up' }, { weightKg: 100 }])).toEqual(['warm-up', 'working']);
  expect(predictLabels([], [{ weightKg: 40, label: 'working' }, { weightKg: 100 }])).toEqual(['working', 'working']);
});

test('an Exercise with no rows has nothing to predict', () => {
  expect(predictLabels([], [])).toEqual([]);
});

test('only Working Sets are passed on, Exercise by Exercise', () => {
  const set = (exercise: string, weightKg: number, label?: 'warm-up' | 'working') => ({ id: `${exercise}-${weightKg}`, exercise, custom: false, weightKg, reps: 5, label });
  const session = {
    localDate: '2026-10-19',
    sets: [set('back-squat', 60), set('bench-press', 40), set('back-squat', 100), set('bench-press', 60), set('back-squat', 100, 'warm-up')],
  };

  expect(workingSets(session).map((s) => [s.exercise, s.weightKg])).toEqual([
    ['back-squat', 100],
    ['bench-press', 60],
  ]);
});
