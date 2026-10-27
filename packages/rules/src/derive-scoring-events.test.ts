import { expect, test } from 'vitest';
import { deriveScoringEvents } from './index.ts';

test("Ana's first Session derives no Scoring Events, because no Scoring Event kinds exist yet", () => {
  const ana = {
    sessions: [
      {
        localDate: '2026-10-19',
        sets: [
          { exercise: 'back-squat', custom: false, weightKg: 100, reps: 5 },
          { exercise: 'back-squat', custom: false, weightKg: 100, reps: 5 },
          { exercise: 'back-squat', custom: false, weightKg: 100, reps: 4 },
        ],
      },
    ],
  };

  expect(deriveScoringEvents(ana)).toEqual([]);
});
