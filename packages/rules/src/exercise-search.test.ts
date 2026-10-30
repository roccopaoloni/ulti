import { expect, test } from 'vitest';
import { isMuscle, matchesSearch, muscles } from './index.ts';

test('there are 11 muscles, and only they are muscles', () => {
  expect(muscles).toEqual(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full-body']);
  expect(['chest', 'full-body', 'Chest', 'abs', '', null, 3].map(isMuscle)).toEqual([true, true, false, false, false, false, false]);
});

test('a search ignores case and accents, and every word has to match', () => {
  expect(matchesSearch('Sentadilla búlgara Mancuernas', 'BULGARA')).toBe(true);
  expect(matchesSearch('Press banca Mancuernas', 'mancuernas press')).toBe(true);
  expect(matchesSearch('Peso muerto Barra', 'extensión')).toBe(false);
  expect(matchesSearch('Dumbbell curl', 'curl bar')).toBe(false);
  expect(matchesSearch('Dumbbell curl', '   ')).toBe(true);
  expect(matchesSearch('Buenos días Barra', 'dias')).toBe(true);
});
