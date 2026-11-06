import { expect, test } from 'vitest';
import { findCustomExercise, packRoutineLink, unpackRoutineLink, type RoutineDay } from './index.ts';

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

const wrist = { name: ' Wrist curl ', equipment: null, muscle: 'biceps' } as const;
const customDays: RoutineDay[] = [
  { id: 'a', name: 'Arms', colour: 1, exercises: [{ exerciseId: 'bench', sets: 3, repMin: 8, repMax: 12 }, { exerciseId: 'custom-1', sets: 2, repMin: 10, repMax: 15 }] },
];

test('Custom Exercises pack as name, equipment and muscle, and unpack as Custom Exercises, not dropped IDs', () => {
  const data = packRoutineLink(customDays, 'Ana', new Map([['custom-1', wrist]]));
  expect(unpackRoutineLink(data, known)).toEqual({
    sender: 'Ana',
    days: [{ name: 'Arms', colour: 1, exercises: [{ exerciseId: 'bench', sets: 3, repMin: 8, repMax: 12 }, { custom: wrist, sets: 2, repMin: 10, repMax: 15 }] }],
    dropped: 0,
  });
  // Nothing about the sender's private ID travels.
  expect(JSON.stringify(unpackRoutineLink(data, known))).not.toContain('custom-1');
});

test('a Custom Exercise keeps its name exactly as written, accents and emoji included', () => {
  const data = packRoutineLink(customDays, 'Ana', new Map([['custom-1', { name: 'Remo ñandú 💪', equipment: 'cable', muscle: 'back' }]]));
  const link = unpackRoutineLink(data, known);
  expect(link?.days[0].exercises[1]).toMatchObject({ custom: { name: 'Remo ñandú 💪', equipment: 'cable', muscle: 'back' } });
});

test('a Custom Exercise ID the sender no longer has is still dropped as unknown', () => {
  const data = packRoutineLink(customDays, 'Ana');
  expect(unpackRoutineLink(data, known)?.dropped).toBe(1);
});

test('a link with a malformed Custom Exercise is rejected', () => {
  // Written by hand: [1, 'Ana', [['Arms', 0, [[custom, 3, 8, 12]]]]] with the custom being...
  const blankName = 'WzEsIkFuYSIsW1siQXJtcyIsMCxbW1siICIsbnVsbCwiY29yZSJdLDMsOCwxMl1dXV1d'; // [' ', null, 'core']
  const numberName = 'WzEsIkFuYSIsW1siQXJtcyIsMCxbW1s1LG51bGwsImNvcmUiXSwzLDgsMTJdXV1dXQ'; // [5, null, 'core']
  const numberEquipment = 'WzEsIkFuYSIsW1siQXJtcyIsMCxbW1siQ3VybCIsNywiY29yZSJdLDMsOCwxMl1dXV1d'; // ['Curl', 7, 'core']
  const unknownMuscle = 'WzEsIkFuYSIsW1siQXJtcyIsMCxbW1siQ3VybCIsbnVsbCwiYWJzIl0sMyw4LDEyXV1dXV0'; // ['Curl', null, 'abs']
  const fine = 'WzEsIkFuYSIsW1siQXJtcyIsMCxbW1siQ3VybCIsbnVsbCwiY29yZSJdLDMsOCwxMl1dXV1d'; // ['Curl', null, 'core']
  expect([blankName, numberName, numberEquipment, unknownMuscle].map((data) => unpackRoutineLink(data, known))).toEqual([null, null, null, null]);
  expect(unpackRoutineLink(fine, known)?.days[0].exercises).toEqual([{ custom: { name: 'Curl', equipment: null, muscle: 'core' }, sets: 3, repMin: 8, repMax: 12 }]);
});

test("an incoming Custom Exercise matches one of the recipient's ignoring capitals and surrounding spaces, with the same equipment", () => {
  const own = [
    { id: 'custom-a', nameEn: 'WRIST CURL', equipment: null, custom: true },
    { id: 'custom-b', nameEn: 'Cable fly', equipment: 'cable', custom: true },
    { id: 'bench', nameEn: 'Wrist curl', equipment: null, custom: false },
  ];
  expect(findCustomExercise(wrist, own)).toBe('custom-a');
  expect(findCustomExercise({ name: 'cable FLY  ', equipment: 'cable', muscle: 'chest' }, own)).toBe('custom-b');
  expect(findCustomExercise({ name: 'Cable fly', equipment: null, muscle: 'chest' }, own)).toBeUndefined();
  expect(findCustomExercise({ name: 'Bench', equipment: null, muscle: 'chest' }, own)).toBeUndefined();
});

test('a bodyweight Custom Exercise round-trips through a link, and matching respects its equipment', () => {
  const rollout = { name: 'Ab wheel', equipment: 'bodyweight', muscle: 'core' } as const;
  const data = packRoutineLink(customDays, 'Ana', new Map([['custom-1', rollout]]));
  expect(unpackRoutineLink(data, known)?.days[0].exercises[1]).toMatchObject({ custom: rollout });
  const own = [
    { id: 'custom-a', nameEn: 'Ab wheel', equipment: null, custom: true },
    { id: 'custom-b', nameEn: 'AB wheel', equipment: 'bodyweight', custom: true },
  ];
  expect(findCustomExercise(rollout, own)).toBe('custom-b');
  expect(findCustomExercise(rollout, own.slice(0, 1))).toBeUndefined();
});
