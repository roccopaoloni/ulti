import { muscles } from '@ulti/rules';
import { expect, test } from 'vitest';
import { blendPose, drawableMuscles, LENGTHS, solve } from './rig.ts';
import { figureFor, FIGURES, STANDING_FIGURE } from './poses.ts';

// The catalog's migrations, as text.
const sql = Object.values(import.meta.glob<string>('../../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }));

// The catalog Exercise IDs, and the main muscle each is filed under, as the migrations seed them.
const catalogIds = new Set<string>();
for (const file of sql) {
  if (!/insert into public\.exercises/.test(file)) continue;
  for (const [, id] of file.matchAll(/^\s*\('([a-z0-9-]+)', '[^']*', '[^']*', '(?:weighted|bodyweight)'/gm)) catalogIds.add(id!);
}
const filedUnder = new Map<string, string>();
for (const [, id, muscle] of sql.join('\n').matchAll(/^\s*\('([a-z0-9-]+)', '([a-z-]+)'\)/gm)) {
  if ((muscles as readonly string[]).includes(muscle!)) filedUnder.set(id!, muscle!);
}

const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);

test('every catalog Exercise has a figure, and no figure is for an Exercise that does not exist', () => {
  expect(catalogIds.size).toBe(63);
  for (const id of catalogIds) expect(FIGURES[id], id).toBeDefined();
  expect(Object.keys(FIGURES).filter((id) => !catalogIds.has(id))).toEqual([]);
});

test('every muscle a figure works or assists is one the figure can draw', () => {
  expect([...drawableMuscles].sort()).toEqual([...muscles].sort());
  for (const [id, figure] of Object.entries(FIGURES)) {
    expect(figure.worked.length, id).toBeGreaterThan(0);
    for (const muscle of [...figure.worked, ...figure.assist]) expect(drawableMuscles, `${id}: ${muscle}`).toContain(muscle);
  }
});

test('an Exercise works the muscle the Picker files it under', () => {
  for (const id of catalogIds) {
    expect(filedUnder.get(id), id).toBeDefined();
    expect(FIGURES[id]!.worked, id).toContain(filedUnder.get(id));
  }
});

test('every pose has the same body: limb and torso lengths never change, only angles', () => {
  const figures = [...Object.entries(FIGURES), ['standing', STANDING_FIGURE] as const];
  for (const [id, figure] of figures) {
    for (const t of [0, 0.25, 0.5, 1]) {
      const joints = solve(blendPose(figure.start, figure.end, t), figure.view);
      const at = `${id} at ${t}`;
      expect(dist(joints.hip, joints.torsoTop), at).toBeCloseTo(LENGTHS.torso, 6);
      for (const leg of joints.legs) {
        expect(dist(leg.hip, leg.knee), at).toBeCloseTo(LENGTHS.thigh, 6);
        expect(dist(leg.knee, leg.ankle), at).toBeCloseTo(LENGTHS.shank, 6);
      }
      // An arm bone turned towards the viewer is seen shorter, by exactly the cosine of the turn,
      // as a camera would see it; it never grows or shrinks otherwise.
      const pose = blendPose(figure.start, figure.end, t);
      const seen = (bone: 0 | 1) => Math.cos(((pose.depth?.[bone] ?? 0) * Math.PI) / 180);
      for (const arm of joints.arms) {
        expect(dist(arm.shoulder, arm.elbow), at).toBeCloseTo(LENGTHS.upperArm * seen(0), 6);
        expect(dist(arm.elbow, arm.wrist), at).toBeCloseTo(LENGTHS.foreArm * seen(1), 6);
      }
    }
  }
});

test('a hand that holds a bar stays on it all through the movement', () => {
  const holding = Object.entries(FIGURES).filter(([, figure]) => figure.start.grab);
  expect(holding.map(([id]) => id)).toEqual(expect.arrayContaining(['inverted-row', 'pull-up']));
  for (const [id, figure] of holding) {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const pose = blendPose(figure.start, figure.end, t);
      expect(dist(solve(pose, figure.view).arms[0]!.hand, pose.grab!), `${id} at ${t}`).toBeLessThan(0.01);
    }
  }
});

test('a standing figure is proportioned like a person: fingertips reach mid-thigh, and the head tops out at the full height', () => {
  const joints = solve(STANDING_FIGURE.start, STANDING_FIGURE.view);
  const arm = joints.arms[0]!;
  const floor = joints.legs[0]!.ankle[1] + LENGTHS.ankleHeight;
  const height = (point: number[]) => floor - point[1]!;
  const fingertip = height(arm.wrist) - LENGTHS.hand;
  expect(fingertip).toBeLessThan(height(joints.hip));
  expect(fingertip).toBeGreaterThan(height(joints.legs[0]!.knee));
  expect(height(joints.head) + LENGTHS.headRadius).toBeCloseTo(LENGTHS.height, 0);
});

test('blending two poses moves every angle in a straight line from the first to the second', () => {
  const a = { torso: 0, leg: [0, 0], arm: [10, 20], pin: { j: 'ankle' as const, at: [90, 178] } };
  const b = { torso: 40, leg: [100, -30], arm: [10, 60], pin: { j: 'ankle' as const, at: [90, 178] } };
  expect(blendPose(a, b, 0)).toEqual(a);
  expect(blendPose(a, b, 1)).toEqual(b);
  expect(blendPose(a, b, 0.5)).toEqual({ torso: 20, leg: [50, -15], arm: [10, 40], pin: a.pin });
});

test('a Custom Exercise shows the standing figure with its chosen muscle', () => {
  expect(figureFor('3f2c9a1e-custom-id', 'biceps').worked).toEqual(['biceps']);
  expect(figureFor('3f2c9a1e-custom-id', 'biceps').view).toBe(STANDING_FIGURE.view);
  expect(figureFor('back-squat', 'quads')).toBe(FIGURES['back-squat']);
});
