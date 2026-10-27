import { expect, test } from 'vitest';
import { deriveScoringEvents } from './index.ts';

test("Ana's first Session derives no Scoring Events, because it only sets her baseline", () => {
  const ana = {
    userId: 'ana',
    sessions: [
      {
        localDate: '2026-10-19',
        sets: [
          { id: 's1', exercise: 'back-squat', custom: false, weightKg: 100, reps: 5 },
          { id: 's2', exercise: 'back-squat', custom: false, weightKg: 100, reps: 5 },
          { id: 's3', exercise: 'back-squat', custom: false, weightKg: 100, reps: 4 },
        ],
      },
    ],
  };

  expect(deriveScoringEvents(ana)).toEqual([]);
});
