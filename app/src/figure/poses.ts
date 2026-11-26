import type { Muscle } from '@ulti/rules';
import { FLOOR, LENGTHS, type Anchor, type Figure, type Gear, type Pose } from './rig.ts';

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

type Spec = { view?: Figure['view']; start: Pose; end?: Pose; gear?: Gear[]; worked: Muscle[]; assist?: Muscle[] };
const figure = ({ view = 'side', start, end = start, gear = [], worked, assist = [] }: Spec): Figure => ({ view, start, end, gear, worked, assist });

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
const BAR_IN_FRONT: P2 = [75, 255];
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
    start: { torso: 45, neck: -22, leg: [0, 0], hip: [-28.6, -38.4], arm: [0, 0], pin: stand(80) },
    end: { torso: 4, leg: [0, 0], hip: [-10, -72], arm: onTorso(4, [75, 255]), pin: stand(80) },
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

  'bench-press': benchPress(UP, [100, 235], [barbell([0, 0], 14)], ['chest', 'triceps'], ['shoulders']),
  'close-grip-bench-press': benchPress(UP, [125, 215], [barbell([0, 0], 14)], ['triceps', 'chest'], ['shoulders']),
  'dumbbell-bench-press': benchPress(UP, [100, 235], [dumbbell], ['chest'], ['triceps', 'shoulders']),
  'smith-machine-bench-press': benchPress(UP, [100, 235], [line([66, -20], [66, FLOOR], 3, { fit: false }), line(hand, [66, 60], 2), handle], ['chest', 'triceps'], ['shoulders']),
  'machine-chest-press': seatedPress([-70, 90], [90, 90], [handle, line(hand, [58, 90], 4)], ['chest', 'triceps'], ['shoulders']),

  'pull-up': figure({
    start: hangingFrom([4, 4]),
    end: { torso: -6, neck: -12, leg: [4, -6], arm: [30, 165], pin: HANGING },
    gear: chinUpStation,
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
  'inverted-row': figure({
    start: { torso: -84, neck: 20, leg: [0, 0], hip: [-82.5, -14], arm: UP, pin: { j: 'ankle', at: [181, ANKLE_Y] } },
    end: { torso: -62, neck: 20, leg: [0, 0], hip: [-72, -43], arm: [-70, 153], pin: { j: 'ankle', at: [181, ANKLE_Y] } },
    gear: [{ t: 'plate', at: [50, 95], r: 3.5, front: true }, { t: 'rect', x: 56, y: 95, w: 6, h: 91, fit: false }],
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
const FIGURES_3: Record<string, Figure> = {
  'romanian-deadlift': hinge([barbell([0, 0], 15)], 75, [-28, -68], [-6, -6], [2, 2], ['hamstrings', 'glutes'], ['back']),
  'dumbbell-romanian-deadlift': hinge([dumbbell], 75, [-28, -68], [-6, -6], [2, 2], ['hamstrings', 'glutes'], ['back']),
  'good-morning': hinge([barbell()], 70, [-30, -66], onTorso(70, BAR_ON_BACK), onTorso(3, BAR_ON_BACK), ['hamstrings', 'glutes'], ['back']),
  'barbell-hip-thrust': figure({
    start: { torso: -44, neck: 20, leg: [0, 0], hip: [-34, -18], arm: [50, 60], pin: { j: 'ankle', at: [130, ANKLE_Y] } },
    end: { torso: -85, neck: 20, leg: [0, 0], hip: [-42, -42], arm: [88, 95], pin: { j: 'ankle', at: [130, ANKLE_Y] } },
    gear: [...flatBench(24, 143, 62).slice(0, 2), { t: 'plate', at: at('hip', [4, -9]), r: 13 }],
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
    end: { torso: 92, neck: -22, leg: [-92, 150], arm: [100, 100], pin: { j: 'hip', at: [112, 138] } },
    gear: [line([40, 152], [185, 152], 7), { t: 'rect', x: 150, y: 156, w: 6, h: 30 }, { t: 'rect', x: 60, y: 156, w: 6, h: 30 }, { t: 'plate', at: at('ankle', [0, -4]), r: 4.5, front: true }],
    worked: ['hamstrings'],
    assist: ['calves'],
  }),
  'seated-leg-curl': figure({
    start: { ...seatedBody, leg: [90, 86], arm: [5, 70], pin: pinHip },
    end: { ...seatedBody, leg: [90, -20], arm: [5, 70], pin: pinHip },
    gear: [...seatedGear, line(at('knee', [-26, -12]), at('knee', [-4, -12]), 6, { front: true }), { t: 'plate', at: at('ankle', [0, -6]), r: 4.5, front: true }],
    worked: ['hamstrings'],
    assist: ['calves'],
  }),
  'standing-calf-raise': figure({
    start: { torso: 0, leg: [0, 0], hip: TALL, foot: 16, arm: onTorso(0, [30, 185]), pin: stand() },
    end: { torso: 0, leg: [0, 0], hip: TALL, foot: 63, arm: onTorso(0, [30, 185]), pin: { j: 'ankle', at: [92, ANKLE_Y - 8] } },
    gear: [{ t: 'plate', at: at('shoulder', [0, -8]), r: 8, front: true }],
    worked: ['calves'],
  }),
  'seated-calf-raise': figure({
    start: { torso: -4, leg: [0, 0], hip: [-42, -42], foot: 16, arm: [5, 70], pin: pinHip },
    end: { torso: -4, leg: [0, 0], hip: [-42, -34], foot: 63, arm: [5, 70], pin: pinHip },
    gear: [...seatedGear, line(at('knee', [-22, -12]), at('knee', [4, -12]), 9, { front: true })],
    worked: ['calves'],
  }),
  'barbell-shrug': figure({
    start: { torso: 0, leg: [0, 0], hip: TALL, arm: [0, 0], shrug: 0, pin: stand() },
    end: { torso: 0, leg: [0, 0], hip: TALL, arm: [0, 0], shrug: 8, pin: stand() },
    gear: [barbell([0, 0], 15)],
    worked: ['shoulders'],
    assist: ['back'],
  }),
  'dumbbell-shrug': figure({
    start: { torso: 0, leg: [0, 0], hip: TALL, arm: [0, 0], shrug: 0, pin: stand() },
    end: { torso: 0, leg: [0, 0], hip: TALL, arm: [0, 0], shrug: 8, pin: stand() },
    gear: [dumbbell],
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
  dip: figure({
    start: { torso: 8, neck: -12, leg: [-10, -85], arm: [0, 0], pin: { j: 'hand', at: [100, 112] } },
    end: { torso: 28, neck: -25, leg: [-10, -85], arm: [-40, 5], pin: { j: 'hand', at: [100, 112] } },
    gear: [{ t: 'plate', at: hand, r: 3.5, front: true }, { t: 'rect', x: 97, y: 116, w: 6, h: FLOOR - 116, fit: false }],
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
  'incline-bench-press': benchPress(UP, [100, 235], [barbell([0, 0], 14)], ['chest', 'shoulders'], ['triceps'], INCLINE, { j: 'hip', at: inclineHip }, inclineGear, { hip: [-30, -50] }),
  'dumbbell-incline-bench-press': benchPress(UP, [100, 235], [dumbbell], ['chest', 'shoulders'], ['triceps'], INCLINE, { j: 'hip', at: inclineHip }, inclineGear, { hip: [-30, -50] }),
  'decline-bench-press': benchPress(UP, [100, 235], [barbell([0, 0], 14)], ['chest'], ['triceps', 'shoulders'], DECLINE, { j: 'hip', at: declineHip }, declineGear, { hip: [-34, -66] }),
  'dumbbell-fly': benchPress(UP, [120, 150], [dumbbell], ['chest'], ['shoulders']),
  'cable-fly': figure({
    start: { torso: 8, leg: [0, 0], hip: TALL, arm: [-85, -85], pin: stand() },
    end: { torso: 8, leg: [0, 0], hip: TALL, arm: [75, 90], pin: stand() },
    gear: [pulley(34, 24), cable([34, 24]), handle, stack(10, 60, 110)],
    worked: ['chest'],
    assist: ['shoulders'],
  }),
  'pec-deck': figure({
    start: { ...seatedBody, arm: [60, 175], pin: SEATED },
    end: { ...seatedBody, arm: [95, 185], pin: SEATED },
    gear: [...seatedGear, line(at('hand', [0, -16]), at('hand', [0, 8]), 6, { front: true })],
    worked: ['chest'],
    assist: ['shoulders'],
  }),
  'push-up': figure({
    start: { torso: 64, neck: -35, leg: [-64, -64], arm: [0, 0], pin: { j: 'hand', at: [140, 182] } },
    end: { torso: 81, neck: -35, leg: [-81, -81], arm: [-70, 66], pin: { j: 'hand', at: [140, 182] } },
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

export const FIGURES: Record<string, Figure> = { ...FIGURES_1, ...FIGURES_2, ...FIGURES_3, ...FIGURES_4, ...FIGURES_5 };

export const STANDING_FIGURE: Figure = figure({ start: { torso: 0, leg: [0, 0], arm: HANG, pin: stand() }, worked: [] });


// The figure of an Exercise: its own for a catalog Exercise, the standing figure with the chosen
// muscle for a Custom one.
export function figureFor(exerciseId: string, muscle: Muscle): Figure {
  return FIGURES[exerciseId] ?? { ...STANDING_FIGURE, worked: [muscle] };
}
