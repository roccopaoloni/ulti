import type { Muscle } from '@ulti/rules';

// The figure: one body, the same for every Exercise. Its segments are fixed lengths, set from
// anthropometric averages (Drillis & Contini) as fractions of a height of 170: upper arm 0.186,
// forearm 0.146, hand 0.108 (drawn shorter, it is a fist), thigh 0.245, shank 0.246, shoulder to
// hip 0.29, head 0.13. A pose can only change angles, never these.
export const LENGTHS = {
  height: 170,
  torso: 49, // hip joint to shoulder joint
  upperArm: 32,
  foreArm: 25,
  hand: 16, // wrist to fingertip
  grip: 7, // wrist to the middle of the fist, where a bar is held
  thigh: 42,
  shank: 42,
  ankleHeight: 8,
  heel: 6,
  toe: 18,
  headDistance: 19, // shoulder joint to the middle of the head
  headRadius: 10,
};

// A pose is only angles, in degrees. Limbs: 0 points straight down, 90 forward (the way the figure
// faces, +x), 180 up, -90 backward. Torso: 0 upright, positive leaning forward, -90 lying on the back.
// Neck is the head's tilt from the torso line. A `leg2` or `arm2` is the second limb (otherwise it
// mirrors the first in a front view and hides behind it in a side view). `hip` says where the hip
// is from the first ankle instead (x forward, y down), and the knee bends to fit: a squat is a hip
// that drops, with the feet staying planted; `foot2` does the same for the second ankle. `pin`
// nails one joint to a spot of the scene, so feet and hands stay put while the rest moves.
export type Pose = {
  torso: number;
  neck?: number;
  leg: [number, number];
  leg2?: [number, number];
  foot?: number;
  hip?: [number, number];
  foot2?: [number, number];
  arm: [number, number];
  arm2?: [number, number];
  // Shoulders lifted towards the ears, in scene units.
  shrug?: number;
  pin: { j: 'ankle' | 'hip' | 'hand'; at: [number, number] };
};

export type View = 'side' | 'front';
export const FLOOR = 186;

type Point = [number, number];
const RAD = Math.PI / 180;
const down = (angle: number): Point => [Math.sin(angle * RAD), Math.cos(angle * RAD)];
const toward = (from: Point, direction: Point, length: number): Point => [from[0] + direction[0] * length, from[1] + direction[1] * length];

export type Joints = {
  view: View;
  up: Point; // along the torso, towards the head
  forward: Point; // across the torso, towards the chest
  hip: Point;
  torsoTop: Point;
  head: Point;
  legs: { hip: Point; knee: Point; ankle: Point; heel: Point; toe: Point }[];
  arms: { shoulder: Point; elbow: Point; wrist: Point; hand: Point; tip: Point }[];
};

export function solve(pose: Pose, view: View): Joints {
  const front = view === 'front';
  const up: Point = [Math.sin(pose.torso * RAD), -Math.cos(pose.torso * RAD)];
  const forward: Point = [Math.cos(pose.torso * RAD), Math.sin(pose.torso * RAD)];
  const hip: Point = [0, 0];
  const torsoTop = toward(hip, up, LENGTHS.torso);
  const neck = pose.neck ?? 0;
  const head = toward(torsoTop, [Math.sin((pose.torso + neck) * RAD), -Math.cos((pose.torso + neck) * RAD)], LENGTHS.headDistance);
  const sides = front || pose.arm2 ? [1, -1] : [1];
  const foot = (pose.foot ?? 16) * RAD;
  const root = (side: number): Point => (front ? toward(hip, forward, 8 * side) : hip);
  // Two bones from `from` to `to`; the knee bends forward. Out of reach, the leg stretches straight.
  const bend = (from: Point, to: Point) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const reach = Math.min(Math.hypot(dx, dy) || 1, LENGTHS.thigh + LENGTHS.shank - 0.001);
    const along = (LENGTHS.thigh ** 2 - LENGTHS.shank ** 2 + reach ** 2) / (2 * reach);
    const across = Math.sqrt(Math.max(0, LENGTHS.thigh ** 2 - along ** 2));
    const unit: Point = [dx / Math.hypot(dx, dy), dy / Math.hypot(dx, dy)];
    const sideways: Point = unit[1] >= 0 ? [unit[1], -unit[0]] : [-unit[1], unit[0]];
    const knee: Point = [from[0] + unit[0] * along + sideways[0] * across, from[1] + unit[1] * along + sideways[1] * across];
    return { knee, ankle: toward(from, unit, reach) };
  };
  const planted: Point | null = pose.hip ? [-pose.hip[0], -pose.hip[1]] : null;
  const legSides = front || pose.leg2 || pose.foot2 ? [1, -1] : [1];
  const legs = legSides.map((side) => {
    const top = root(side);
    const angles = side === 1 ? pose.leg : (pose.leg2 ?? [-pose.leg[0], -pose.leg[1]]);
    const target = planted && side === 1 ? planted : planted && pose.foot2 ? [planted[0] + pose.foot2[0], planted[1] + pose.foot2[1]] as Point : null;
    const { knee, ankle } = target ? bend(top, target) : { knee: toward(top, down(angles[0]), LENGTHS.thigh), ankle: toward(toward(top, down(angles[0]), LENGTHS.thigh), down(angles[1]), LENGTHS.shank) };
    const heel: Point = front ? ankle : [ankle[0] - LENGTHS.heel, ankle[1]];
    const toe: Point = front ? [ankle[0] + side * 10, ankle[1] + 3] : [ankle[0] + Math.cos(foot) * LENGTHS.toe, ankle[1] + Math.sin(foot) * LENGTHS.toe];
    return { hip: top, knee, ankle, heel, toe };
  });
  const arms = sides.map((side) => {
    const shoulder = toward(front ? toward(torsoTop, forward, 18 * side) : torsoTop, up, pose.shrug ?? 0);
    const angles = side === 1 ? pose.arm : (pose.arm2 ?? [-pose.arm[0], -pose.arm[1]]);
    const elbow = toward(shoulder, down(angles[0]), LENGTHS.upperArm);
    const wrist = toward(elbow, down(angles[1]), LENGTHS.foreArm);
    return { shoulder, elbow, wrist, hand: toward(wrist, down(angles[1]), LENGTHS.grip), tip: toward(wrist, down(angles[1]), LENGTHS.hand) };
  });
  const pinned = pose.pin.j === 'ankle' ? legs[0]!.ankle : pose.pin.j === 'hip' ? hip : arms[0]!.hand;
  const shift: Point = [pose.pin.at[0] - pinned[0], pose.pin.at[1] - pinned[1]];
  const move = (p: Point): Point => [p[0] + shift[0], p[1] + shift[1]];
  return {
    view,
    up,
    forward,
    hip: move(hip),
    torsoTop: move(torsoTop),
    head: move(head),
    legs: legs.map((l) => ({ hip: move(l.hip), knee: move(l.knee), ankle: move(l.ankle), heel: move(l.heel), toe: move(l.toe) })),
    arms: arms.map((a) => ({ shoulder: move(a.shoulder), elbow: move(a.elbow), wrist: move(a.wrist), hand: move(a.hand), tip: move(a.tip) })),
  };
}

// Every number between two poses, in a straight line (a pose is only numbers, arrays of them and
// the pin's joint name).
export function blendPose<T>(from: T, to: T, t: number): T {
  if (typeof from === 'number') return (from + ((to as number) - from) * t) as T;
  if (Array.isArray(from)) return from.map((value, index) => blendPose(value, (to as unknown[])[index], t)) as T;
  if (from && typeof from === 'object') {
    return Object.fromEntries(Object.entries(from).map(([key, value]) => [key, key in (to as object) ? blendPose(value, (to as Record<string, unknown>)[key], t) : value])) as T;
  }
  return from;
}

// Where a muscle sits on the body: a stretch of a body part, on its front (1) or back (-1) face, or
// a disc on a joint.
export type MuscleShape = { part: 'torso' | 'thigh' | 'shank' | 'upperArm'; from: number; to: number; face: 1 | -1 } | { disc: 'shoulder' | 'glute'; r: number };

const SHAPES: Record<Exclude<Muscle, 'full-body'>, MuscleShape[]> = {
  chest: [{ part: 'torso', from: 0.5, to: 0.94, face: 1 }],
  back: [{ part: 'torso', from: 0.26, to: 0.96, face: -1 }],
  shoulders: [{ disc: 'shoulder', r: 8.5 }],
  biceps: [{ part: 'upperArm', from: 0.12, to: 0.9, face: 1 }],
  triceps: [{ part: 'upperArm', from: 0.12, to: 0.9, face: -1 }],
  quads: [{ part: 'thigh', from: 0.1, to: 0.94, face: 1 }],
  hamstrings: [{ part: 'thigh', from: 0.1, to: 0.94, face: -1 }],
  glutes: [{ disc: 'glute', r: 8.5 }],
  calves: [{ part: 'shank', from: 0.06, to: 0.72, face: -1 }],
  core: [{ part: 'torso', from: 0.06, to: 0.5, face: 1 }],
};

export const MUSCLE_SHAPES: Record<Muscle, MuscleShape[]> = { ...SHAPES, 'full-body': Object.values(SHAPES).flat() };
export const drawableMuscles = Object.keys(MUSCLE_SHAPES) as Muscle[];

// Equipment, drawn simply. A gear point is a spot of the scene, or a joint of the body (`at`, with an
// optional shift `d`), so a barbell travels with the hands and a pad with the feet. Gear drawn
// `front` is over the body, the rest behind it; gear with `fit: false` does not count when the
// figure is framed.
export type Anchor = [number, number] | { at: 'hand' | 'hand2' | 'ankle' | 'knee' | 'hip' | 'shoulder' | 'head'; d?: [number, number] };
export type Gear = (
  | { t: 'plate'; at: Anchor; r: number } // a weight seen end-on: a barbell plate or a dumbbell
  | { t: 'line'; a: Anchor; b: Anchor; w: number } // a bar, a bench, a rail, a cable
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx?: number; slits?: number } // a block: a stack, a seat
  | { t: 'pulley'; at: [number, number]; r: number }
) & { front?: boolean; fit?: boolean };

export function anchorPoint(anchor: Anchor, joints: Joints): Point {
  if (Array.isArray(anchor)) return anchor;
  const arm = anchor.at === 'hand2' ? joints.arms[1] ?? joints.arms[0]! : joints.arms[0]!;
  const base: Point =
    anchor.at === 'hand' || anchor.at === 'hand2'
      ? arm.hand
      : anchor.at === 'ankle'
        ? joints.legs[0]!.ankle
        : anchor.at === 'knee'
          ? joints.legs[0]!.knee
          : anchor.at === 'hip'
            ? joints.hip
            : anchor.at === 'head'
              ? joints.head
              : arm.shoulder;
  return [base[0] + (anchor.d?.[0] ?? 0), base[1] + (anchor.d?.[1] ?? 0)];
}

// What an Exercise's figure is: the body moving from the start pose to the end pose, with its gear
// and the muscles it works (pink) and those that assist (pale pink).
export type Figure = { view: View; start: Pose; end: Pose; gear: Gear[]; worked: Muscle[]; assist: Muscle[] };

// The square of the scene that frames a figure at its start, middle and end, with its gear.
export function frameOf(figure: Figure): { x: number; y: number; size: number } {
  const points: Point[] = [];
  for (const t of [0, 0.5, 1]) {
    const joints = solve(blendPose(figure.start, figure.end, t), figure.view);
    points.push(joints.hip, joints.torsoTop, toward(joints.head, [0, -1], LENGTHS.headRadius), toward(joints.head, [0, 1], LENGTHS.headRadius));
    for (const leg of joints.legs) points.push(leg.knee, leg.ankle, leg.toe, leg.heel);
    for (const arm of joints.arms) points.push(arm.elbow, arm.tip);
    for (const item of figure.gear) {
      if (item.fit === false) continue;
      if (item.t === 'plate') {
        const at = anchorPoint(item.at, joints);
        points.push([at[0] - item.r, at[1] - item.r], [at[0] + item.r, at[1] + item.r]);
      } else if (item.t === 'line') points.push(anchorPoint(item.a, joints), anchorPoint(item.b, joints));
      else if (item.t === 'rect') points.push([item.x, item.y], [item.x + item.w, item.y + item.h]);
      else points.push([item.at[0] - item.r, item.at[1] - item.r], [item.at[0] + item.r, item.at[1] + item.r]);
    }
  }
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const left = Math.min(...xs) - 12;
  const right = Math.max(...xs) + 12;
  const top = Math.min(...ys) - 12;
  const bottom = Math.min(Math.max(...ys) + 8, FLOOR + 2);
  const size = Math.max(right - left, bottom - top, 110);
  const y = Math.min((top + bottom) / 2 - size / 2, FLOOR + 3 - size);
  return { x: (left + right) / 2 - size / 2, y, size };
}
