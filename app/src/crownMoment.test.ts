import { expect, test } from 'vitest';
import { crownMoment } from './crownMoment.ts';

const crown = (id: number, group_name: string, period: 'week' | 'month' | 'year', points: number, shared_with = 0) => ({ id, group_name, period, points, shared_with });

test('the title follows the biggest Period among the wins: year over month over week', () => {
  expect(crownMoment([crown(1, 'A', 'week', 10), crown(2, 'B', 'month', 20)]).period).toBe('month');
  expect(crownMoment([crown(1, 'A', 'month', 10), crown(2, 'B', 'year', 20), crown(3, 'C', 'week', 5)]).period).toBe('year');
  expect(crownMoment([crown(1, 'A', 'week', 10), crown(2, 'B', 'week', 20)]).period).toBe('week');
});

test('every crown gets one row, in the order given, with its Group, Period, points and who it is tied with', () => {
  const { rows } = crownMoment([crown(1, 'Meso', 'week', 201), crown(2, 'Los del gym', 'month', 640, 1)]);
  expect(rows).toEqual([
    { id: 1, group: 'Meso', period: 'week', points: 201, tiedWith: 0 },
    { id: 2, group: 'Los del gym', period: 'month', points: 640, tiedWith: 1 },
  ]);
});

test('a single win is one row with the title of its own Period', () => {
  const m = crownMoment([crown(7, 'Meso', 'year', 5120)]);
  expect(m.period).toBe('year');
  expect(m.rows).toHaveLength(1);
});
