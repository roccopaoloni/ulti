import { expect, test } from 'vitest';
import { packRoutineLink, unpackRoutineLink, type RoutineDay } from './index.ts';

const known = new Set(['bench', 'row', 'squat']);
const days: RoutineDay[] = [
  { id: 'a', name: 'Empuje ñandú', colour: 2, exercises: [{ exerciseId: 'bench', sets: 3, repMin: 8, repMax: 12 }, { exerciseId: 'row', sets: 4, repMin: 6, repMax: 10 }] },
  { id: 'b', name: 'Piernas 💪', colour: 4, exercises: [{ exerciseId: 'squat', sets: 5, repMin: 5, repMax: 5 }] },
];
const withoutIds = days.map(({ id: _id, ...day }) => day);

// Links written by hand (JSON of [version, sender, [[day, colour, [[exercise, sets, min, max]]]]], base64url).
const valid = 'WzEsIkFuYSIsW1siUHVzaCIsMCxbWyJiZW5jaCIsMyw4LDEyXV1dXV0';
const unknownVersion = 'WzIsIkFuYSIsW1siUHVzaCIsMCxbWyJiZW5jaCIsMyw4LDEyXV1dXV0';
const zeroSets = 'WzEsIkFuYSIsW1siUHVzaCIsMCxbWyJiZW5jaCIsMCw4LDEyXV1dXV0';
const backwardsRange = 'WzEsIkFuYSIsW1siUHVzaCIsMCxbWyJiZW5jaCIsMywxMiw4XV1dXV0';
const textReps = 'WzEsIkFuYSIsW1siUHVzaCIsMCxbWyJiZW5jaCIsMyw4LCJ4Il1dXV1d';

test('a Routine packs into a URL-safe string and unpacks to the same Days and sender', () => {
  const data = packRoutineLink(days, 'Ana Pérez');
  expect(data).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(unpackRoutineLink(data, known)).toEqual({ sender: 'Ana Pérez', days: withoutIds, dropped: 0 });
});

test('a link written by hand in the first version unpacks', () => {
  expect(unpackRoutineLink(valid, known)).toEqual({
    sender: 'Ana',
    days: [{ name: 'Push', colour: 0, exercises: [{ exerciseId: 'bench', sets: 3, repMin: 8, repMax: 12 }] }],
    dropped: 0,
  });
});

test('data it cannot read is rejected', () => {
  expect(unpackRoutineLink(packRoutineLink(days, 'Ana').slice(0, 20), known)).toBeNull();
  expect(unpackRoutineLink('', known)).toBeNull();
  expect(unpackRoutineLink('not a link!', known)).toBeNull();
});

test('data with an unknown version is rejected', () => {
  expect(unpackRoutineLink(unknownVersion, known)).toBeNull();
});

test('Exercises the app does not know are dropped and counted, and a Day left empty goes too', () => {
  const data = packRoutineLink(
    [
      { id: 'a', name: 'Push', colour: 0, exercises: [{ exerciseId: 'bench', sets: 3, repMin: 8, repMax: 12 }, { exerciseId: 'gone', sets: 3, repMin: 8, repMax: 12 }] },
      { id: 'b', name: 'Ghost', colour: 1, exercises: [{ exerciseId: 'gone', sets: 3, repMin: 8, repMax: 12 }, { exerciseId: 'gone2', sets: 3, repMin: 8, repMax: 12 }] },
    ],
    'Ana',
  );
  expect(unpackRoutineLink(data, known)).toEqual({
    sender: 'Ana',
    days: [{ name: 'Push', colour: 0, exercises: [{ exerciseId: 'bench', sets: 3, repMin: 8, repMax: 12 }] }],
    dropped: 3,
  });
});

test('a link with nothing left to load is rejected', () => {
  const data = packRoutineLink([{ id: 'a', name: 'Push', colour: 0, exercises: [{ exerciseId: 'gone', sets: 3, repMin: 8, repMax: 12 }] }], 'Ana');
  expect(unpackRoutineLink(data, known)).toBeNull();
});

test('Sets and Rep Ranges that could not be in a Routine are rejected', () => {
  expect(unpackRoutineLink(zeroSets, known)).toBeNull();
  expect(unpackRoutineLink(backwardsRange, known)).toBeNull();
  expect(unpackRoutineLink(textReps, known)).toBeNull();
});
