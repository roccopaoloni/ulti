import { expect, test } from 'vitest';
import { exerciseImages } from './exerciseImages.ts';

// The picture folders shipped in `public/exercises`, one per catalog Exercise.
const shipped = Object.keys(import.meta.glob('../public/exercises/*/thumb.webp')).map((path) => path.split('/').at(-2)!);

test('every Exercise with a picture folder in the app has its pictures found', () => {
  expect(shipped.length).toBeGreaterThan(0);
  for (const id of shipped) expect(exerciseImages(id), id).not.toBeNull();
});

test('an Exercise gives its thumbnail and its start and end frames', () => {
  expect(exerciseImages('back-squat')).toEqual({
    thumb: '/exercises/back-squat/thumb.webp',
    frames: ['/exercises/back-squat/0.webp', '/exercises/back-squat/1.webp'],
  });
});

test('Custom Exercises and catalog Exercises without a match have no pictures', () => {
  expect(exerciseImages('snatch-press')).toBeNull();
  expect(exerciseImages('3f2c9a1e-custom-id')).toBeNull();
  expect(shipped).not.toContain('snatch-press');
});
