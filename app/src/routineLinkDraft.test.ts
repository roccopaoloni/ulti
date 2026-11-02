import { packRoutineLink } from '@ulti/rules';
import { expect, test } from 'vitest';
import { routineFromLink } from './routineLinkDraft.ts';

const catalog = [
  { id: 'bench', custom: false },
  { id: 'squat', custom: false },
  { id: 'mine', custom: true },
];
const day = (name: string, ids: string[]) => ({ id: name, name, colour: 0, exercises: ids.map((exerciseId) => ({ exerciseId, sets: 3, repMin: 8, repMax: 12 })) });

// Which Routine the onboarding Routine step starts from, given the Routine Link kept on the phone.
test('a kept link becomes a draft with fresh Day IDs, and says who shared it', () => {
  const data = packRoutineLink([day('Push', ['bench']), day('Legs', ['squat'])], 'Ana');
  const routine = routineFromLink(data, catalog)!;
  expect(routine.sender).toBe('Ana');
  expect(routine.draft.map((d) => d.name)).toEqual(['Push', 'Legs']);
  expect(routine.draft[0].exercises).toEqual([{ exerciseId: 'bench', sets: 3, repMin: 8, repMax: 12 }]);
  expect(new Set(routine.draft.map((d) => d.id)).size).toBe(2);
  expect(routine.draft.map((d) => d.id)).not.toContain('Push');
});

test('Exercises the catalog does not know are dropped, and so are Days left empty', () => {
  const data = packRoutineLink([day('Push', ['bench', 'gone']), day('Ghost', ['gone'])], 'Ana');
  const routine = routineFromLink(data, catalog)!;
  expect(routine.draft.map((d) => d.name)).toEqual(['Push']);
  expect(routine.dropped).toBe(2);
});

test('a kept link with a Custom Exercise keeps it as one, not as a dropped ID, ready to be resolved', () => {
  const custom = { name: 'Wrist curl', equipment: null, muscle: 'biceps' } as const;
  const data = packRoutineLink([day('Arms', ['bench', 'custom-1'])], 'Ana', new Map([['custom-1', custom]]));
  const routine = routineFromLink(data, catalog)!;
  expect(routine.dropped).toBe(0);
  expect(routine.draft[0].exercises[1]).toEqual({ custom, sets: 3, repMin: 8, repMax: 12 });
});

test('an unreadable link, or nothing kept, gives no Routine', () => {
  expect(routineFromLink('not a link', catalog)).toBeNull();
  expect(routineFromLink('', catalog)).toBeNull();
});
