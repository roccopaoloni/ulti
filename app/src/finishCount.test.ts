import { expect, test } from 'vitest';
import { finishCount } from './finishCount.ts';

const plan = [
  { exerciseId: 'bench', sets: 3, repMin: 6, repMax: 10 },
  { exerciseId: 'row', sets: 2, repMin: 8, repMax: 12 },
];
const sets = (...exerciseIds: string[]) => exerciseIds.map((exerciseId) => ({ exerciseId }));

test('a Session with no Routine Day just counts its Sets', () => {
  expect(finishCount([], sets('bench', 'bench', 'squat'))).toEqual({ logged: 3 });
});

test('a Routine Day Session counts logged Sets against the planned ones', () => {
  expect(finishCount(plan, sets('bench', 'bench', 'row'))).toEqual({ logged: 3, planned: 5 });
});

test('an Exercise the Routine Day does not plan adds to neither side', () => {
  expect(finishCount(plan, sets('bench', 'curl', 'curl', 'curl'))).toEqual({ logged: 1, planned: 5 });
});

test('Sets beyond what an Exercise plans do not push logged past planned', () => {
  expect(finishCount(plan, sets('row', 'row', 'row', 'row'))).toEqual({ logged: 2, planned: 5 });
});
