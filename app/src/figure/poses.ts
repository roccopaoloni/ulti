import type { Muscle } from '@ulti/rules';
import { FLOOR, LENGTHS, solve, type Anchor, type Figure, type Gear, type Pose } from './rig.ts';

// The figure of every catalog Exercise: a start pose and an end pose (angles only, the body never
// changes size), its gear, and the muscles it works and assists. The same body does them all, so a
// pose that looks wrong is fixed by its angles, never by a longer arm.
//
// Angles: limbs 0 = down, 90 = forward, 180 = up. Torso 0 = upright, positive leaning forward,
// -90 = lying on the back. `hip` is where the hip is from the planted ankle, so a squat is a hip
// that drops and the feet stay put.

type P2 = [number, number];
const ANKLE_Y = FLOOR - LENGTHS.ankleHeight;

// Standing with the ankle planted at x.
const stand = (x = 92): Pose['pin'] => ({ j: 'ankle', at: [x, ANKLE_Y] });
// The hip straight above the ankle: standing tall.
const TALL: P2 = [0, -83.5];
// Arms hanging by the sides, and straight up.
const HANG: P2 = [2, 2];
const UP: P2 = [178, 178];
// An arm angle held against the torso: it turns with the torso.
const onTorso = (torso: number, [upper, fore]: P2): P2 => [torso + upper, torso + fore];

const hand: Anchor = { at: 'hand' };
const hand2: Anchor = { at: 'hand2' };
const at = (name: 'hand' | 'hand2' | 'ankle' | 'knee' | 'hip' | 'shoulder' | 'head', d: P2 = [0, 0]): Anchor => ({ at: name, d });
// A barbell seen end-on: its plate, behind the lifter.
const barbell = (d: P2 = [0, 0], r = 15): Gear => ({ t: 'plate', at: at('hand', d), r });
// A dumbbell seen end-on, in front, and a pair of them seen from the front.
const dumbbell: Gear = { t: 'plate', at: hand, r: 6, front: true };
const dumbbells: Gear[] = [dumbbell, { t: 'plate', at: hand2, r: 6, front: true }];
// A dumbbell held with its axis pointing forward (a hammer grip).
const hammer: Gear[] = [{ t: 'line', a: at('hand', [-8, 0]), b: at('hand', [8, 0]), w: 7, front: true }];
const line = (a: Anchor, b: Anchor, w = 4, extra: { front?: boolean; fit?: boolean } = {}): Gear => ({ t: 'line', a, b, w, ...extra });
const cable = (from: P2, to: Anchor = hand): Gear => line(from, to, 1.8);
const handle: Gear = { t: 'plate', at: hand, r: 3.4, front: true };
const stack = (x: number, y: number, h = 80): Gear => ({ t: 'rect', x, y, w: 16, h, rx: 3, slits: 6, fit: false });
const pulley = (x: number, y: number): Gear => ({ t: 'pulley', at: [x, y], r: 5 });

// A flat bench, the pad's top at y.
const flatBench = (x: number, y = 143, w = 98): Gear[] => [
  { t: 'rect', x, y, w, h: 8, rx: 4 },
  { t: 'rect', x: x + 10, y: y + 8, w: 6, h: FLOOR - y - 8, rx: 2 },
  { t: 'rect', x: x + w - 16, y: y + 8, w: 6, h: FLOOR - y - 8, rx: 2 },
];
// A pad along the back of a body leaning at `torso` with its hips at `hip`.
const backPad = (hip: P2, torso: number, behind = 13, reach = 12): Gear => {
  const rad = (Math.PI / 180) * torso;
  const up: P2 = [Math.sin(rad), -Math.cos(rad)];
  const forward: P2 = [Math.cos(rad), Math.sin(rad)];
  const a: P2 = [hip[0] - forward[0] * behind, hip[1] - forward[1] * behind];
  const b: P2 = [a[0] + up[0] * (LENGTHS.torso + reach), a[1] + up[1] * (LENGTHS.torso + reach)];
  return line(a, b, 7);
};
// A seat under hips at hip, on a post.
const seat = (hip: P2, from = -14, to = 26): Gear[] => [
  line([hip[0] + from, hip[1] + 13], [hip[0] + to, hip[1] + 13], 7),
  { t: 'rect', x: hip[0] + 4, y: hip[1] + 15, w: 6, h: FLOOR - hip[1] - 15, rx: 2 },
];

type Spec = { view?: Figure['view']; start: Pose; end?: Pose; gear?: Gear[]; worked: Muscle[]; assist?: Muscle[]; thumb?: number };
const figure = ({ view = 'side', start, end = start, gear = [], worked, assist = [], thumb }: Spec): Figure => ({ view, start, end, gear, worked, assist, thumb });

// ---- Squats ---------------------------------------------------------------------------------

type Squat = { top: number; lean: number; depth: P2; rack: P2; gear: Gear[]; pin?: Pose['pin']; worked?: Muscle[]; assist?: Muscle[] };
const squat = ({ top, lean, depth, rack, gear, pin = stand(), worked = ['quads', 'glutes'], assist = ['hamstrings', 'core'] }: Squat): Figure =>
  figure({
    start: { torso: top, leg: [0, 0], hip: TALL, arm: onTorso(top, rack), pin },
    end: { torso: lean, neck: -lean * 0.4, leg: [0, 0], hip: depth, arm: onTorso(lean, rack), pin },
    gear,
    worked,
    assist,
  });
const BAR_ON_BACK: P2 = [-35, 163];
// Racked on the front of the shoulders: elbows high and forward, the hands just in front of the
// collarbones.
const BAR_IN_FRONT: P2 = [70, 232];
const SMITH_RAIL: Gear[] = [line([100, -20], [100, FLOOR], 3, { fit: false })];

// ---- Pulls from the floor -------------------------------------------------------------------

const deadlift = (startTorso: number, startHip: P2, plate = 17): Figure =>
  figure({
    start: { torso: startTorso, neck: -22, leg: [0, 0], hip: startHip, arm: [0, 0], pin: stand(80) },
    end: { torso: -2, leg: [0, 0], hip: TALL, arm: [0, 0], pin: stand(80) },
    gear: [barbell([0, 0], plate)],
    worked: ['back', 'hamstrings', 'glutes'],
    assist: ['quads', 'core'],
  });

// ---- Presses --------------------------------------------------------------------------------

const RACK: P2 = [30, 185];
const SEATED: Pose['pin'] = { j: 'hip', at: [84, 136] };
const seatedBody = { torso: -4, leg: [90, 0] as P2 };
const seatedGear: Gear[] = [...seat([84, 136]), backPad([84, 136], -4)];
// Lying on a bench: the hip at (112, 133), the feet on the floor.
const LYING: Pose['pin'] = { j: 'hip', at: [112, 133] };
const lyingBody = { torso: -90, leg: [60, 0] as P2, hip: [-30, -45] as P2 };
const BENCH = flatBench(32);
// The bar down on the lower chest: the forearm upright under it, the elbow below and towards the
// feet.
const BAR_ON_CHEST: P2 = [51, 180];

const press = (start: P2, end: P2, gear: Gear[], worked: Muscle[], assist: Muscle[], neckEnd = 0): Figure =>
  figure({
    start: { torso: 0, leg: [0, 0], hip: TALL, arm: start, pin: stand() },
    end: { torso: 0, neck: neckEnd, leg: [0, 0], hip: TALL, arm: end, pin: stand() },
    gear,
    worked,
    assist,
  });
const seatedPress = (start: P2, end: P2, gear: Gear[], worked: Muscle[], assist: Muscle[]): Figure =>
  figure({ start: { ...seatedBody, arm: start, pin: SEATED }, end: { ...seatedBody, arm: end, pin: SEATED }, gear: [...seatedGear, ...gear], worked, assist });
const benchPress = (start: P2, end: P2, gear: Gear[], worked: Muscle[], assist: Muscle[], torso = -90, pin: Pose['pin'] = LYING, extra: Gear[] = BENCH, body: Partial<Pose> = {}): Figure =>
  figure({ start: { ...lyingBody, ...body, torso, arm: start, pin }, end: { ...lyingBody, ...body, torso, arm: end, pin }, gear: [...extra, ...gear], worked, assist });

// ---- Hanging and dipping ----------------------------------------------------------------------

const HANGING: Pose['pin'] = { j: 'hand', at: [100, -25] };
// A pull-up bar seen from the front, the hands wide on it: the hips rise from a dead hang until the
// chin clears the bar, the elbows bending out to the sides.
const PULL_UP_BAR: P2 = [136, 0];
const pullUpBar: Gear[] = [
  line([30, 0], [150, 0], 4),
  { t: 'rect', x: 26, y: -4, w: 6, h: FLOOR + 4, rx: 3, fit: false },
  { t: 'rect', x: 148, y: -4, w: 6, h: FLOOR + 4, rx: 3, fit: false },
  { t: 'plate', at: hand, r: 3.5, front: true },
  { t: 'plate', at: hand2, r: 3.5, front: true },
];
const chinUpStation: Gear[] = [
  { t: 'plate', at: hand, r: 3.5, front: true },
  line([100, -25], [133, -25], 4),
  { t: 'rect', x: 130, y: -29, w: 6, h: FLOOR + 29, rx: 3, fit: false },
];
const hangingFrom = (legs: Pose['leg']): Pose => ({ torso: 0, leg: legs, arm: UP, pin: HANGING });

const FIGURES_1: Record<string, Figure> = {
  'back-squat': squat({ top: 4, lean: 40, depth: [-24, -50], rack: BAR_ON_BACK, gear: [barbell()] }),
  'front-squat': squat({ top: 3, lean: 24, depth: [-18, -52], rack: BAR_IN_FRONT, gear: [barbell([4, 0])], assist: ['hamstrings', 'core'] }),
  'goblet-squat': squat({ top: 3, lean: 22, depth: [-18, -52], rack: [8, 150], gear: [dumbbell], assist: ['core'] }),
  'smith-machine-squat': squat({ top: 4, lean: 40, depth: [-24, -50], rack: BAR_ON_BACK, gear: [...SMITH_RAIL, line(hand, [100, 0], 2), handle], pin: stand(100) }),
  deadlift: deadlift(50, [-31.5, -41.5]),
  'sumo-deadlift': deadlift(35, [-22, -33]),
  'power-clean': figure({
    start: { torso: 45, neck: -22, leg: [0, 0], hip: [-28.6, -38.4], arm: [0, 0], grab: [86, 168.8], elbow: 1, pin: stand(80) },
    end: { torso: 4, leg: [0, 0], hip: [-10, -72], arm: onTorso(4, BAR_IN_FRONT), grab: [77.6, 48], elbow: 1, pin: stand(80) },
    gear: [barbell([0, 0], 17)],
    worked: ['full-body'],
  }),

  'overhead-press': press(RACK, UP, [barbell([0, 0], 14)], ['shoulders', 'triceps'], ['core'], -6),
  'push-press': figure({
    start: { torso: 0, leg: [0, 0], hip: [-3, -76], arm: RACK, pin: stand() },
    end: { torso: 0, neck: -6, leg: [0, 0], hip: TALL, arm: UP, pin: stand() },
    gear: [barbell([0, 0], 14)],
    worked: ['shoulders'],
    assist: ['triceps', 'quads'],
  }),
  'snatch-press': figure({
    start: { torso: 3, leg: [0, 0], hip: TALL, arm: onTorso(3, BAR_ON_BACK), pin: stand() },
    end: { torso: 0, neck: -6, leg: [0, 0], hip: TALL, arm: UP, pin: stand() },
    gear: [barbell([0, 0], 14)],
    worked: ['shoulders'],
    assist: ['triceps', 'back'],
  }),
  'dumbbell-shoulder-press': seatedPress(RACK, UP, [dumbbell], ['shoulders', 'triceps'], []),
  'machine-shoulder-press': seatedPress(RACK, UP, [handle, line(hand, [58, 66], 4)], ['shoulders', 'triceps'], []),
  'smith-machine-shoulder-press': seatedPress([10, 182], UP, [line([88, -20], [88, FLOOR], 3, { fit: false }), line(hand, [88, 30], 2), handle], ['shoulders', 'triceps'], []),

  'bench-press': benchPress(UP, BAR_ON_CHEST, [barbell([0, 0], 14)], ['chest', 'triceps'], ['shoulders']),
  'close-grip-bench-press': benchPress(UP, [45, 180], [barbell([0, 0], 14)], ['triceps', 'chest'], ['shoulders']),
  'dumbbell-bench-press': benchPress(UP, BAR_ON_CHEST, [dumbbell], ['chest'], ['triceps', 'shoulders']),
  'smith-machine-bench-press': benchPress(UP, BAR_ON_CHEST, [line([66, -20], [66, FLOOR], 3, { fit: false }), line(hand, [66, 60], 2), handle], ['chest', 'triceps'], ['shoulders']),
  'machine-chest-press': seatedPress([-70, 90], [90, 90], [handle, line(hand, [58, 90], 4)], ['chest', 'triceps'], ['shoulders']),

  'pull-up': figure({
    view: 'front',
    start: { torso: 0, leg: [2, 0], foot: 0, arm: UP, grab: PULL_UP_BAR, elbow: 1, pin: { j: 'hip', at: [90, 106] } },
    end: { torso: 0, leg: [2, 0], foot: 0, arm: UP, grab: PULL_UP_BAR, elbow: 1, pin: { j: 'hip', at: [90, 62] } },
    gear: pullUpBar,
    worked: ['back', 'biceps'],
    assist: ['shoulders', 'core'],
  }),
};

// ---- Pulls ------------------------------------------------------------------------------------

// Bent over from the hips, the bar hanging from straight arms and rowed to the belly.
const row = (torso: number, hip: P2, plate: number, worked: Muscle[], assist: Muscle[]): Figure =>
  figure({
    start: { torso, neck: -25, leg: [0, 0], hip, arm: [0, 0], pin: stand(80) },
    end: { torso, neck: -25, leg: [0, 0], hip, arm: [-100, 5], pin: stand(80) },
    gear: [barbell([0, 0], plate)],
    worked,
    assist,
  });
const pulldownHip: P2 = [84, 136];
const FIGURES_2: Record<string, Figure> = {
  'chin-up': figure({
    start: hangingFrom([2, -55]),
    end: { torso: -4, neck: -12, leg: [2, -55], arm: [30, 165], pin: HANGING },
    gear: chinUpStation,
    worked: ['back', 'biceps'],
    assist: ['shoulders', 'core'],
  }),
  'barbell-row': row(60, [-25, -70], 14, ['back'], ['biceps', 'core']),
  'pendlay-row': row(80, [-30, -64], 17, ['back'], ['biceps', 'hamstrings']),
  'dumbbell-row': figure({
    start: { torso: 78, neck: -25, leg: [0, 0], hip: [-28, -66], arm: [0, 0], arm2: [20, 50], pin: stand(80) },
    end: { torso: 78, neck: -25, leg: [0, 0], hip: [-28, -66], arm: [-100, 5], arm2: [20, 50], pin: stand(80) },
    gear: [dumbbell, { t: 'rect', x: 78, y: 150, w: 70, h: 8, rx: 4 }, { t: 'rect', x: 88, y: 158, w: 6, h: 28 }, { t: 'rect', x: 132, y: 158, w: 6, h: 28 }],
    worked: ['back'],
    assist: ['biceps'],
  }),
  'machine-row': figure({
    start: { ...seatedBody, torso: 0, arm: [92, 92], pin: { j: 'hip', at: [74, 136] } },
    end: { ...seatedBody, torso: 0, arm: [-70, 92], pin: { j: 'hip', at: [74, 136] } },
    gear: [...seat([74, 136]), line([92, 68], [92, 112], 7), handle, line(hand, [165, 105], 4)],
    worked: ['back'],
    assist: ['biceps'],
  }),
  'seated-cable-row': figure({
    start: { torso: 18, neck: -10, leg: [78, 60], arm: [85, 88], pin: { j: 'hip', at: [60, 152] } },
    end: { torso: -4, leg: [78, 60], arm: [-75, 92], pin: { j: 'hip', at: [60, 152] } },
    gear: [{ t: 'rect', x: 40, y: 165, w: 44, h: 8, rx: 4 }, { t: 'rect', x: 150, y: 150, w: 5, h: 36, fit: false }, pulley(166, 140), cable([166, 140]), handle, stack(172, 60, 120)],
    worked: ['back'],
    assist: ['biceps'],
  }),
  'lat-pulldown': figure({
    start: { ...seatedBody, arm: [176, 178], pin: { j: 'hip', at: pulldownHip } },
    end: { ...seatedBody, arm: [5, 175], pin: { j: 'hip', at: pulldownHip } },
    gear: [...seat(pulldownHip), backPad(pulldownHip, -4), { t: 'plate', at: at('knee', [-10, -10]), r: 5, front: true }, pulley(88, -22), cable([88, -22]), line(at('hand', [-18, 0]), at('hand', [18, 0]), 4.5, { front: true }), stack(150, 10, 150)],
    worked: ['back', 'biceps'],
    assist: ['shoulders'],
  }),
  // A straight body hanging under a low bar from the heels, pulled up until the chest meets the bar.
  'inverted-row': figure({
    start: { torso: -66, neck: 8, leg: [66, 66], arm: UP, grab: [85.4, 65.6], elbow: -1, pin: { j: 'ankle', at: [181, ANKLE_Y] } },
    end: { torso: -40, neck: 8, leg: [40, 40], arm: UP, grab: [85.4, 65.6], elbow: -1, pin: { j: 'ankle', at: [181, ANKLE_Y] } },
    gear: [{ t: 'plate', at: [85.4, 65.6], r: 3.5, front: true }, { t: 'rect', x: 82.5, y: 66, w: 6, h: FLOOR - 66, rx: 2, fit: false }],
    worked: ['back', 'biceps'],
    assist: ['core'],
  }),
  'face-pull': figure({
    start: { torso: 0, leg: [0, 0], hip: TALL, arm: [90, 92], pin: stand() },
    end: { torso: 0, leg: [0, 0], hip: TALL, arm: [-65, 135], pin: stand() },
    gear: [pulley(176, 47), cable([176, 47]), stack(180, 60, 110)],
    worked: ['shoulders'],
    assist: ['back'],
  }),
};

// ---- Hips and legs ------------------------------------------------------------------------------

const hinge = (gear: Gear[], torso: number, hip: P2, arm: P2, armStart: P2, worked: Muscle[], assist: Muscle[]): Figure =>
  figure({
    start: { torso: 3, leg: [0, 0], hip: TALL, arm: armStart, pin: stand(80) },
    end: { torso, neck: -torso * 0.3, leg: [0, 0], hip, arm, pin: stand(80) },
    gear,
    worked,
    assist,
  });
const lunge = (gear: Gear[], arm: P2): Figure =>
  figure({
    start: { torso: 3, leg: [0, 0], hip: [-14, -80], foot2: [-34, -8], arm, pin: stand(110) },
    end: { torso: 3, leg: [0, 0], hip: [-20, -52], foot2: [-62, -8], arm, pin: stand(110) },
    gear,
    worked: ['quads', 'glutes'],
    assist: ['hamstrings'],
  });
const pinHip: Pose['pin'] = { j: 'hip', at: [84, 136] };
// A calf raise: the foot turns from -8° (heel below the toes) to 50° about the ball of the foot, so
// the ankle moves by RISE. The step is under the toes, its top at the sole.
const TOE = (angle: number): P2 => [Math.cos((angle * Math.PI) / 180) * LENGTHS.toe, Math.sin((angle * Math.PI) / 180) * LENGTHS.toe];
const RISE: P2 = [TOE(-8)[0] - TOE(50)[0], TOE(-8)[1] - TOE(50)[1]];
const STEP_ANKLE = ANKLE_Y - 16;
const step = (ankleX: number): Gear => ({ t: 'rect', x: ankleX + TOE(-8)[0] - 12, y: STEP_ANKLE + TOE(-8)[1] + 4, w: 22, h: FLOOR - (STEP_ANKLE + TOE(-8)[1] + 4), rx: 2 });
const FIGURES_3: Record<string, Figure> = {
  'romanian-deadlift': hinge([barbell([0, 0], 15)], 75, [-28, -68], [-6, -6], [2, 2], ['hamstrings', 'glutes'], ['back']),
  'dumbbell-romanian-deadlift': hinge([dumbbell], 75, [-28, -68], [-6, -6], [2, 2], ['hamstrings', 'glutes'], ['back']),
  'good-morning': hinge([barbell()], 70, [-30, -66], onTorso(70, BAR_ON_BACK), onTorso(3, BAR_ON_BACK), ['hamstrings', 'glutes'], ['back']),
  // The upper back on the edge of a bench, the hips low, then driven up until the body is a level
  // line from knees to shoulders. The hands hold the bar on the hips.
  'barbell-hip-thrust': figure({
    start: { torso: -58, neck: 24, leg: [0, 0], hip: [-38.4, -16], arm: UP, grab: [98, 151.8], elbow: -1, pin: { j: 'ankle', at: [130, ANKLE_Y] } },
    end: { torso: -88, neck: 24, leg: [0, 0], hip: [-31, -40.3], arm: UP, grab: [99.4, 125.7], elbow: -1, pin: { j: 'ankle', at: [130, ANKLE_Y] } },
    gear: [...flatBench(-4, 143, 60).slice(0, 2), { t: 'plate', at: hand, r: 13 }],
    worked: ['glutes'],
    assist: ['hamstrings', 'core'],
  }),
  'barbell-lunge': lunge([barbell()], onTorso(3, BAR_ON_BACK)),
  'dumbbell-lunge': lunge([dumbbell], [2, 2]),
  'bulgarian-split-squat': figure({
    start: { torso: 6, leg: [0, 0], hip: [-16, -78], foot2: [-60, -44], arm: [2, 2], pin: stand(120) },
    end: { torso: 6, leg: [0, 0], hip: [-20, -50], foot2: [-60, -44], arm: [2, 2], pin: stand(120) },
    gear: [dumbbell, { t: 'rect', x: 40, y: 138, w: 40, h: 8, rx: 4 }, { t: 'rect', x: 52, y: 146, w: 6, h: 40 }],
    worked: ['quads', 'glutes'],
    assist: ['hamstrings'],
  }),
  'leg-press': figure({
    start: { torso: -52, neck: 28, leg: [0, 0], hip: [-43, 36], foot: -50, arm: [10, 100], pin: { j: 'hip', at: [60, 150] } },
    end: { torso: -52, neck: 28, leg: [0, 0], hip: [-61, 51], foot: -50, arm: [10, 100], pin: { j: 'hip', at: [60, 150] } },
    gear: [backPad([60, 150], -52), line([44, 164], [80, 164], 7), line([84, 176], [170, 110], 3, { fit: false }), line(at('ankle', [-5, -19]), at('ankle', [18, 9]), 5)],
    worked: ['quads', 'glutes'],
    assist: ['hamstrings'],
  }),
  'hack-squat': figure({
    start: { torso: -12, neck: 12, leg: [0, 0], hip: [-2, -82], arm: [10, 60], pin: stand(100) },
    end: { torso: -12, neck: 12, leg: [0, 0], hip: [4, -52], arm: [10, 60], pin: stand(100) },
    gear: [line([91, 129], [73, 39], 7)],
    worked: ['quads'],
    assist: ['glutes'],
  }),
  'leg-extension': figure({
    start: { ...seatedBody, leg: [90, 5], arm: [5, 70], pin: pinHip },
    end: { ...seatedBody, leg: [90, 90], arm: [5, 70], pin: pinHip },
    gear: [...seatedGear, { t: 'plate', at: at('ankle', [0, -6]), r: 4.5, front: true }],
    worked: ['quads'],
  }),
  'lying-leg-curl': figure({
    start: { torso: 92, neck: -22, leg: [-92, -92], arm: [100, 100], pin: { j: 'hip', at: [112, 138] } },
    end: { torso: 92, neck: -22, leg: [-92, -210], arm: [100, 100], pin: { j: 'hip', at: [112, 138] } },
    gear: [line([40, 152], [185, 152], 7), { t: 'rect', x: 150, y: 156, w: 6, h: 30 }, { t: 'rect', x: 60, y: 156, w: 6, h: 30 }, { t: 'plate', at: at('ankle', [0, -4]), r: 4.5, front: true }],
    worked: ['hamstrings'],
    assist: ['calves'],
    // Lying flat, the start is a thin line at 48px: the small figure shows the curl halfway up.
    thumb: 0.65,
  }),
  'seated-leg-curl': figure({
    start: { ...seatedBody, leg: [90, 86], arm: [5, 70], pin: pinHip },
    end: { ...seatedBody, leg: [90, -20], arm: [5, 70], pin: pinHip },
    gear: [...seatedGear, line(at('knee', [-26, -12]), at('knee', [-4, -12]), 6, { front: true }), { t: 'plate', at: at('ankle', [0, -6]), r: 4.5, front: true }],
    worked: ['hamstrings'],
    assist: ['calves'],
  }),
  // The balls of the feet on a step: the heels drop below it, then rise as high as they go. The
  // toes stay put, so the ankle travels up and a little forward.
  'standing-calf-raise': figure({
    start: { torso: 0, leg: [0, 0], hip: TALL, foot: -8, arm: onTorso(0, [30, 185]), pin: { j: 'ankle', at: [92, STEP_ANKLE] } },
    end: { torso: 0, leg: [0, 0], hip: TALL, foot: 50, arm: onTorso(0, [30, 185]), pin: { j: 'ankle', at: [92 + RISE[0], STEP_ANKLE + RISE[1]] } },
    gear: [{ t: 'plate', at: at('shoulder', [0, -8]), r: 8, front: true }, step(92)],
    worked: ['calves'],
  }),
  'seated-calf-raise': figure({
    start: { torso: -4, leg: [0, 0], hip: [-42, 136 - STEP_ANKLE], foot: -8, arm: [5, 70], pin: pinHip },
    end: { torso: -4, leg: [0, 0], hip: [-42 - RISE[0], 136 - STEP_ANKLE - RISE[1]], foot: 50, arm: [5, 70], pin: pinHip },
    gear: [...seatedGear, line(at('knee', [-22, -12]), at('knee', [4, -12]), 9, { front: true }), step(126)],
    worked: ['calves'],
  }),
  // Seen from the front, so the shoulders can be seen rising to the ears.
  'barbell-shrug': figure({
    view: 'front',
    start: { torso: 0, leg: [2, 0], foot: 0, arm: [4, 4], shrug: 0, pin: stand(100) },
    end: { torso: 0, leg: [2, 0], foot: 0, arm: [4, 4], shrug: 11, pin: stand(100) },
    gear: [line(at('hand2', [-16, 0]), at('hand', [16, 0]), 3, { front: true }), line(at('hand', [16, -14]), at('hand', [16, 14]), 6, { front: true }), line(at('hand2', [-16, -14]), at('hand2', [-16, 14]), 6, { front: true })],
    worked: ['shoulders'],
    assist: ['back'],
  }),
  'dumbbell-shrug': figure({
    view: 'front',
    start: { torso: 0, leg: [2, 0], foot: 0, arm: [4, 4], shrug: 0, pin: stand(100) },
    end: { torso: 0, leg: [2, 0], foot: 0, arm: [4, 4], shrug: 11, pin: stand(100) },
    gear: dumbbells,
    worked: ['shoulders'],
    assist: ['back'],
  }),
};

// ---- Arms -------------------------------------------------------------------------------------

const curl = (gear: Gear[]): Figure =>
  figure({
    start: { torso: 0, leg: [0, 0], hip: TALL, arm: [2, 2], pin: stand() },
    end: { torso: 0, leg: [0, 0], hip: TALL, arm: [4, 152], pin: stand() },
    gear,
    worked: ['biceps'],
  });
const FIGURES_4: Record<string, Figure> = {
  'barbell-curl': curl([{ t: 'plate', at: hand, r: 9, front: true }]),
  'dumbbell-curl': curl([dumbbell]),
  'hammer-curl': curl(hammer),
  'cable-curl': curl([pulley(150, 172), cable([150, 172]), handle, stack(166, 80, 100)]),
  'cable-triceps-pushdown': figure({
    start: { torso: 6, leg: [0, 0], hip: TALL, arm: [-6, 118], pin: stand() },
    end: { torso: 6, leg: [0, 0], hip: TALL, arm: [-6, 4], pin: stand() },
    gear: [pulley(112, -4), cable([112, -4]), handle, stack(150, 20, 150)],
    worked: ['triceps'],
  }),
  'cable-overhead-triceps-extension': figure({
    start: { torso: 12, neck: -10, leg: [0, 0], hip: TALL, arm: [176, 340], pin: stand() },
    end: { torso: 12, neck: -10, leg: [0, 0], hip: TALL, arm: [176, 176], pin: stand() },
    gear: [pulley(34, 170), cable([34, 170]), handle, stack(10, 80, 100)],
    worked: ['triceps'],
  }),
  'skull-crusher': benchPress(UP, [178, 300], [barbell([0, 0], 11)], ['triceps'], ['shoulders']),
  // Held up on straight arms between two bars, the knees bent and the feet off the floor, lowered
  // until the upper arms are level.
  dip: figure({
    start: { torso: 6, neck: -6, leg: [8, -75], arm: [0, 0], pin: { j: 'hand', at: [100, 92] } },
    end: { torso: 28, neck: -18, leg: [8, -75], arm: [-72, 22], pin: { j: 'hand', at: [100, 92] } },
    gear: [line([70, 95], [128, 95], 5), { t: 'rect', x: 72, y: 95, w: 6, h: FLOOR - 95, rx: 2, fit: false }, { t: 'rect', x: 120, y: 95, w: 6, h: FLOOR - 95, rx: 2, fit: false }, { t: 'plate', at: hand, r: 3.5, front: true }],
    worked: ['triceps'],
    assist: ['chest', 'shoulders'],
  }),
};

// ---- Chest, shoulders and core ------------------------------------------------------------------

const INCLINE = -50;
const inclineHip: P2 = [108, 128];
const inclineGear: Gear[] = [backPad(inclineHip, INCLINE, 13, 14), line([96, 141], [124, 141], 7), { t: 'rect', x: 104, y: 144, w: 6, h: FLOOR - 144, rx: 2 }];
const DECLINE = -108;
const declineHip: P2 = [118, 112];
const declineGear: Gear[] = [backPad(declineHip, DECLINE, 13, 14), { t: 'rect', x: 150, y: 120, w: 6, h: FLOOR - 120, rx: 2 }, { t: 'plate', at: [150, 140], r: 5, front: true }];
const FIGURES_5: Record<string, Figure> = {
  'incline-bench-press': benchPress(UP, [91, 180], [barbell([0, 0], 14)], ['chest', 'shoulders'], ['triceps'], INCLINE, { j: 'hip', at: inclineHip }, inclineGear, { hip: [-30, -50] }),
  'dumbbell-incline-bench-press': benchPress(UP, [91, 180], [dumbbell], ['chest', 'shoulders'], ['triceps'], INCLINE, { j: 'hip', at: inclineHip }, inclineGear, { hip: [-30, -50] }),
  'decline-bench-press': benchPress(UP, [33, 180], [barbell([0, 0], 14)], ['chest'], ['triceps', 'shoulders'], DECLINE, { j: 'hip', at: declineHip }, declineGear, { hip: [-34, -66] }),
  // From the side, arms that open out to the sides turn towards the viewer: the dumbbells come down
  // from over the chest to beside the shoulders, the arms foreshortened as a camera would see them.
  'dumbbell-fly': figure({
    start: { ...lyingBody, torso: -90, arm: UP, depth: [0, 0], pin: LYING },
    end: { ...lyingBody, torso: -90, arm: UP, depth: [85, 80], pin: LYING },
    gear: [...BENCH, dumbbell],
    worked: ['chest'],
    assist: ['shoulders'],
  }),
  // A cable crossover seen from the front: from the high pulleys on both sides, the arms sweep
  // down and in until the hands meet in front of the hips.
  'cable-fly': figure({
    view: 'front',
    start: { torso: 0, leg: [2, 0], foot: 0, arm: [128, 118], pin: stand(100) },
    end: { torso: 0, leg: [2, 0], foot: 0, arm: [-12, -22], depth: [35, 35], pin: stand(100) },
    gear: [pulley(10, 20), pulley(168, 20), cable([10, 20], hand2), cable([168, 20], hand), handle, { t: 'plate', at: hand2, r: 3.4, front: true }, stack(-6, 20, 160), stack(174, 20, 160)],
    worked: ['chest'],
    assist: ['shoulders'],
  }),
  // From the side, the arms open out to the sides turn towards the viewer, so the elbows start
  // close to the shoulders and swing forward until the pads meet in front of the chest.
  'pec-deck': figure({
    start: { ...seatedBody, arm: [90, 180], depth: [80, 0], pin: SEATED },
    end: { ...seatedBody, arm: [90, 180], depth: [0, 0], pin: SEATED },
    gear: [...seatedGear, line(at('hand', [0, -10]), at('hand', [0, 22]), 7, { front: true })],
    worked: ['chest'],
    assist: ['shoulders'],
  }),
  // The hands and the toes stay planted; the straight body lowers until the chest nearly meets the
  // floor, the elbows bending back.
  'push-up': figure({
    start: { torso: 64, neck: -35, leg: [-64, -64], arm: [0, 0], grab: [140, 182], elbow: 1, pin: { j: 'ankle', at: [20.46, 176.3] } },
    end: { torso: 82, neck: -35, leg: [-82, -82], arm: [0, 0], grab: [140, 182], elbow: 1, pin: { j: 'ankle', at: [20.46, 176.3] } },
    worked: ['chest', 'triceps'],
    assist: ['shoulders', 'core'],
  }),
  'dumbbell-lateral-raise': figure({
    view: 'front',
    start: { torso: 0, leg: [2, 0], foot: 0, arm: [6, 3], pin: stand(100) },
    end: { torso: 0, leg: [2, 0], foot: 0, arm: [85, 80], pin: stand(100) },
    gear: dumbbells,
    worked: ['shoulders'],
  }),
  'cable-lateral-raise': figure({
    view: 'front',
    start: { torso: 0, leg: [2, 0], foot: 0, arm: [6, 3], arm2: [-4, -4], pin: stand(100) },
    end: { torso: 0, leg: [2, 0], foot: 0, arm: [85, 80], arm2: [-4, -4], pin: stand(100) },
    gear: [pulley(70, 180), cable([70, 180]), handle, stack(40, 100, 80)],
    worked: ['shoulders'],
  }),
  'cable-crunch': figure({
    start: { torso: 5, leg: [0, -90], foot: 170, arm: [40, 200], pin: { j: 'hip', at: [96, 134] } },
    end: { torso: 55, neck: 35, leg: [0, -90], foot: 170, arm: onTorso(55, [40, 200]), pin: { j: 'hip', at: [96, 134] } },
    gear: [pulley(96, -10), cable([96, -10]), handle, stack(150, 0, 150)],
    worked: ['core'],
  }),
  'hanging-leg-raise': figure({
    start: hangingFrom([4, 4]),
    end: { torso: -8, neck: -8, leg: [88, 90], arm: UP, pin: HANGING },
    gear: chinUpStation,
    worked: ['core'],
    assist: ['shoulders'],
  }),
};

// A loaded bar, a handle or the floor under the hands travels in a straight line from where the
// hands start to where they end (blending the arm angles would swing it in an arc): the hands hold
// that line and the elbows bend to fit, on the side the end pose bends them.
function straightPath(figure: Figure): Figure {
  const start = solve(figure.start, figure.view).arms[0]!;
  const end = solve(figure.end, figure.view).arms[0]!;
  const bend = (arm: typeof end) => Math.sign((arm.hand[0] - arm.shoulder[0]) * (arm.elbow[1] - arm.shoulder[1]) - (arm.hand[1] - arm.shoulder[1]) * (arm.elbow[0] - arm.shoulder[0]));
  const elbow = bend(end) || bend(start) || 1;
  return { ...figure, start: { ...figure.start, grab: start.hand, elbow }, end: { ...figure.end, grab: end.hand, elbow } };
}
const STRAIGHT_PATHS = [
  'overhead-press', 'push-press', 'snatch-press', 'dumbbell-shoulder-press', 'machine-shoulder-press', 'smith-machine-shoulder-press',
  'bench-press', 'close-grip-bench-press', 'dumbbell-bench-press', 'smith-machine-bench-press', 'machine-chest-press',
  'incline-bench-press', 'dumbbell-incline-bench-press', 'decline-bench-press',
  'barbell-row', 'pendlay-row', 'dumbbell-row', 'machine-row', 'seated-cable-row', 'lat-pulldown',
];
const ALL: Record<string, Figure> = { ...FIGURES_1, ...FIGURES_2, ...FIGURES_3, ...FIGURES_4, ...FIGURES_5 };
export const FIGURES: Record<string, Figure> = Object.fromEntries(Object.entries(ALL).map(([id, figure]) => [id, STRAIGHT_PATHS.includes(id) ? straightPath(figure) : figure]));

export const STANDING_FIGURE: Figure = figure({ start: { torso: 0, leg: [0, 0], arm: HANG, pin: stand() }, worked: [] });


// The figure of an Exercise: its own for a catalog Exercise, the standing figure with the chosen
// muscle for a Custom one.
export function figureFor(exerciseId: string, muscle: Muscle): Figure {
  return FIGURES[exerciseId] ?? { ...STANDING_FIGURE, worked: [muscle] };
}
