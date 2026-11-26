import { useMemo, type ReactNode } from 'react';
import { anchorPoint, blendPose, FLOOR, frameOf, LENGTHS, MUSCLE_SHAPES, solve, type Figure, type Gear, type Joints } from './rig.ts';
import type { Muscle } from '@ulti/rules';

// The figure, drawn as a flat silhouette in the ink colour with the muscles it works in pink and
// the ones that assist in pale pink. The body is round limbs between joints; every Exercise is the
// same body in a different pose (rig.ts).
type Point = [number, number];
type Part = { id: 'thigh' | 'shank' | 'foot' | 'torso' | 'upperArm' | 'foreArm' | 'hand'; a: Point; b: Point; ra: number; rb: number };

const round = (n: number) => Math.round(n * 100) / 100;
const mix = (p: Point, q: Point, t: number): Point => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

// A limb: a tapered capsule from a to b, as a polygon stroked with round joins.
function Limb({ a, b, ra, rb, fill, grow = 0, opacity }: { a: Point; b: Point; ra: number; rb: number; fill: string; grow?: number; opacity?: number }) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const rc = Math.min(ra, rb);
  const r1 = Math.max(ra - rc, 0.01);
  const r2 = Math.max(rb - rc, 0.01);
  const corners = [
    [a[0] + nx * r1, a[1] + ny * r1],
    [b[0] + nx * r2, b[1] + ny * r2],
    [b[0] - nx * r2, b[1] - ny * r2],
    [a[0] - nx * r1, a[1] - ny * r1],
  ];
  return <path d={`M${corners.map((c) => `${round(c[0]!)} ${round(c[1]!)}`).join('L')}Z`} fill={fill} stroke={fill} strokeWidth={round(2 * rc + grow)} strokeLinejoin="round" fillOpacity={opacity} strokeOpacity={opacity} />;
}

function parts(joints: Joints, k: number): { legs: Part[]; torso: Part; arms: Part[] } {
  const front = joints.view === 'front';
  const r = (a: number, b: number): [number, number] => [a * k, b * k];
  const legs = joints.legs.flatMap((leg): Part[] => {
    const [ta, tb] = front ? r(10, 7) : r(10.5, 7.2);
    return [
      { id: 'thigh', a: leg.hip, b: leg.knee, ra: ta, rb: tb },
      { id: 'shank', a: leg.knee, b: leg.ankle, ra: (front ? 6.6 : 7) * k, rb: 4.8 * k },
      { id: 'foot', a: leg.heel, b: leg.toe, ra: 4.6 * k, rb: 3.6 * k },
    ];
  });
  const [ha, hb] = front ? r(14, 20) : r(10.5, 12.5);
  const torso: Part = { id: 'torso', a: joints.hip, b: joints.torsoTop, ra: ha, rb: hb };
  const arms = joints.arms.flatMap((arm): Part[] => [
    { id: 'upperArm', a: arm.shoulder, b: arm.elbow, ra: 5.8 * k, rb: 4.8 * k },
    { id: 'foreArm', a: arm.elbow, b: arm.wrist, ra: 4.8 * k, rb: 3.9 * k },
    { id: 'hand', a: arm.wrist, b: arm.tip, ra: 4 * k, rb: 3.5 * k },
  ]);
  return { legs, torso, arms };
}

// The pink inlays for some muscles, over the parts they sit on.
function Muscles({ muscles, joints, body, alpha, arms }: { muscles: Muscle[]; joints: Joints; body: ReturnType<typeof parts>; alpha: number; arms: boolean }) {
  const front = joints.view === 'front';
  const out: ReactNode[] = [];
  muscles.forEach((muscle) =>
    MUSCLE_SHAPES[muscle].forEach((shape, index) => {
      const key = `${muscle}${index}`;
      const onArm = ('part' in shape && shape.part === 'upperArm') || ('disc' in shape && shape.disc === 'shoulder');
      if (onArm !== arms) return;
      if ('disc' in shape) {
        if (shape.disc === 'shoulder') joints.arms.forEach((arm, i) => out.push(<circle key={`${key}${i}`} cx={round(arm.shoulder[0])} cy={round(arm.shoulder[1])} r={shape.r} fill="var(--accent)" fillOpacity={alpha} />));
        else if (!front) out.push(<circle key={key} cx={round(joints.hip[0] - joints.forward[0] * 6)} cy={round(joints.hip[1] - joints.forward[1] * 6)} r={shape.r} fill="var(--accent)" fillOpacity={alpha} />);
        return;
      }
      if (front && shape.face === -1) return;
      const pool = shape.part === 'torso' ? [body.torso] : [...body.legs, ...body.arms].filter((p) => p.id === shape.part);
      pool.forEach((p, i) => {
        const dx = p.b[0] - p.a[0];
        const dy = p.b[1] - p.a[1];
        const length = Math.hypot(dx, dy) || 1;
        const unit: Point = [dx / length, dy / length];
        const normal: Point = shape.part === 'torso' ? joints.forward : [unit[1], -unit[0]];
        const face = front ? 0 : shape.face;
        const a0 = mix(p.a, p.b, shape.from);
        const b0 = mix(p.a, p.b, shape.to);
        const ra = p.ra + (p.rb - p.ra) * shape.from;
        const rb = p.ra + (p.rb - p.ra) * shape.to;
        const wa = ra * 0.62;
        const wb = rb * 0.62;
        out.push(
          <Limb
            key={`${key}-${i}`}
            a={[a0[0] + normal[0] * face * 0.3 * ra, a0[1] + normal[1] * face * 0.3 * ra]}
            b={[b0[0] + normal[0] * face * 0.3 * rb, b0[1] + normal[1] * face * 0.3 * rb]}
            ra={wa}
            rb={wb}
            fill="var(--accent)"
            opacity={alpha}
          />,
        );
      });
    }),
  );
  return <>{out}</>;
}

function GearSvg({ items, joints, front }: { items: Gear[]; joints: Joints; front: boolean }) {
  return (
    <>
      {items
        .filter((item) => !!item.front === front)
        .map((item, index) => {
          if (item.t === 'plate') {
            const at = anchorPoint(item.at, joints);
            return (
              <g key={index}>
                <circle cx={round(at[0])} cy={round(at[1])} r={item.r} fill="var(--muted)" />
                <circle cx={round(at[0])} cy={round(at[1])} r={Math.max(1.8, item.r * 0.22)} fill="var(--figbg, var(--surface-2))" />
              </g>
            );
          }
          if (item.t === 'line') {
            const a = anchorPoint(item.a, joints);
            const b = anchorPoint(item.b, joints);
            return <line key={index} x1={round(a[0])} y1={round(a[1])} x2={round(b[0])} y2={round(b[1])} stroke="var(--muted)" strokeWidth={item.w} strokeLinecap="round" />;
          }
          if (item.t === 'pulley') {
            return (
              <g key={index}>
                <circle cx={item.at[0]} cy={item.at[1]} r={item.r} fill="var(--muted)" />
                <circle cx={item.at[0]} cy={item.at[1]} r={1.8} fill="var(--figbg, var(--surface-2))" />
              </g>
            );
          }
          return (
            <g key={index}>
              <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={item.rx ?? 2} fill="var(--muted)" />
              {Array.from({ length: item.slits ?? 0 }, (_, i) => (
                <line key={i} x1={item.x + 2} x2={item.x + item.w - 2} y1={item.y + ((i + 1) * item.h) / ((item.slits ?? 0) + 1)} y2={item.y + ((i + 1) * item.h) / ((item.slits ?? 0) + 1)} stroke="var(--figbg, var(--surface-2))" strokeWidth={1.6} />
              ))}
            </g>
          );
        })}
    </>
  );
}

// The figure `t` of the way from its start pose (0) to its end pose (1). A thumbnail draws the
// limbs a little thicker so the body still reads at 48px.
export function FigureSvg({ figure, t, thumb = false, label }: { figure: Figure; t: number; thumb?: boolean; label?: string }) {
  const frame = useMemo(() => frameOf(figure), [figure]);
  const joints = solve(blendPose(figure.start, figure.end, t), figure.view);
  const ink = 'var(--fg)';
  const halo = 'var(--figbg, var(--surface-2))';
  const body = parts(joints, thumb ? 1.22 : 1);
  const assisting = figure.assist.filter((m) => !figure.worked.includes(m));
  const armCount = joints.arms.length;
  const limb = (p: Part, fill: string, grow = 0, index = 0) => <Limb key={`${p.id}${index}${fill}`} a={p.a} b={p.b} ra={p.ra} rb={p.rb} fill={fill} grow={grow} />;
  const arm = (index: number) => body.arms.slice(index * 3, index * 3 + 3);
  return (
    <svg viewBox={`${round(frame.x)} ${round(frame.y)} ${round(frame.size)} ${round(frame.size)}`} xmlns="http://www.w3.org/2000/svg" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <line x1={frame.x} x2={frame.x + frame.size} y1={FLOOR - 0.5} y2={FLOOR - 0.5} stroke="var(--line)" strokeWidth={2} strokeLinecap="round" />
      <GearSvg items={figure.gear} joints={joints} front={false} />
      {body.legs.map((p, i) => limb(p, ink, 0, i))}
      {limb(body.torso, ink)}
      <Limb a={joints.torsoTop} b={joints.head} ra={5} rb={5} fill={ink} />
      <circle cx={round(joints.head[0])} cy={round(joints.head[1])} r={LENGTHS.headRadius * (thumb ? 1.12 : 1)} fill={ink} />
      <Muscles muscles={assisting} joints={joints} body={body} alpha={0.42} arms={false} />
      <Muscles muscles={figure.worked} joints={joints} body={body} alpha={1} arms={false} />
      {Array.from({ length: armCount }, (_, i) => armCount - 1 - i).map((i) => (
        <g key={i}>
          {arm(i).map((p, n) => limb(p, halo, 3.4, n))}
          {arm(i).map((p, n) => limb(p, ink, 0, n))}
        </g>
      ))}
      <Muscles muscles={assisting} joints={joints} body={body} alpha={0.42} arms />
      <Muscles muscles={figure.worked} joints={joints} body={body} alpha={1} arms />
      <GearSvg items={figure.gear} joints={joints} front />
    </svg>
  );
}
