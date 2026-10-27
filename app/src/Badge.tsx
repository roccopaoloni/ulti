import { crestOf, type CrestWing, type Rank, type Tier } from '@ulti/rules';
import type { CSSProperties, ReactNode } from 'react';

// Rank badges: one crest family in polished metal, ported from the UI prototype (design: Rank
// badges). A keystone holds a glowing gem between swept blade wings, lit from above: each piece has
// a face, a bevel band inside its edge and a bright rim, with a soft shadow on the piece behind.
// What each Tier and Division adds is decided by crestOf() in the rules package.

const TIERS: Tier[] = ['bronze', 'silver', 'gold', 'diamond', 'elite'];
const roman = ['', 'I', 'II', 'III', 'IV', 'V'];
const FLIP = 'translate(200 0) scale(-1 1)';

type MetalName = Tier | 'amet';
// Metals: highlight, light, mid, dark, deep.
const METAL: Record<MetalName, string[]> = {
  bronze: ['#ffe2c4', '#f2a46a', '#c26a33', '#7a3815', '#3f1806'],
  silver: ['#ffffff', '#e4ebf5', '#a9b7cc', '#66758f', '#2f3a4f'],
  gold: ['#fff7d1', '#ffd75e', '#e8a51c', '#9a6205', '#4a2c00'],
  diamond: ['#f0fdff', '#9eeaff', '#3fb3ea', '#1c5fa8', '#0b2a5c'],
  elite: ['#f6e6ff', '#c99bff', '#8a4ff0', '#4a1fa6', '#1f0a52'],
  amet: ['#ffe6f8', '#ff9be0', '#e04fb8', '#8a1f86', '#3d0c42'],
};
// Each metal's stone: amber on bronze, sapphire on silver, ruby on gold, ice on diamond, magenta on Elite.
const GEM: Record<Tier, string> = { bronze: 'amber', silver: 'sapphire', gold: 'pink', diamond: 'ice', elite: 'mag' };
const GEMC: Record<string, string[]> = {
  amber: ['#fff6e0', '#ffd08a', '#ff9a2e', '#7a3a05'],
  sapphire: ['#ffffff', '#bcd6ff', '#3d7bff', '#0f2a7a'],
  pink: ['#ffffff', '#ff8cc0', '#ff2d87', '#7a0b3c'],
  ice: ['#ffffff', '#d9fbff', '#5fd3ff', '#0b3f80'],
  mag: ['#ffffff', '#ffa8f0', '#e83cd0', '#4a0a5c'],
};
// The right-hand pieces and the keystone, drawn around a wing root at (110,90).
const PIECE: Record<string, string> = {
  core: 'M100 50L121 76L115 106L100 146L85 106L79 76Z',
  wx: 'M108 78C136 56 162 42 192 32C182 62 158 88 112 98Z',
  w0: 'M110 76C128 62 148 46 168 18C164 48 146 72 114 88Z',
  w1: 'M112 80C140 84 164 72 190 44C176 78 150 96 112 102Z',
  fin: 'M146 80C156 70 164 58 168 38C172 58 166 74 154 86Z',
  w2: 'M110 100C134 104 154 100 176 88C160 110 136 118 108 118Z',
  w3: 'M106 114C124 122 140 128 158 124C142 136 120 140 104 130Z',
  crown: 'M100 20L110 54L100 48L90 54Z',
  spike: 'M106 58L124 30L116 62Z',
};

const pt = (r: number, deg: number): [number, number] => [100 + r * Math.cos((deg * Math.PI) / 180), 100 + r * Math.sin((deg * Math.PI) / 180)];
const P2 = (p: number[]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
const poly = (points: number[][]) => `M${points.map(P2).join('L')}Z`;

// One metal piece: its face, a bevel band inside its edge (lit along the top, dark along the bottom) and a bright rim.
function Piece({ name, metal, transform }: { name: string; metal: MetalName; transform?: string }) {
  return (
    <g filter="url(#bds)" transform={transform}>
      <path d={PIECE[name]} fill={`url(#bf-${metal})`} />
      <path d={PIECE[name]} fill="none" stroke={`url(#bb-${metal})`} strokeWidth="7" clipPath={`url(#bk-${name})`} />
      <path d={PIECE[name]} fill="none" stroke="url(#brim)" strokeWidth="1.1" />
    </g>
  );
}

// A cut gem: a rhombus in a radial glow with a lit facet and a shaded one.
function Gem({ cx, cy, w, h, stone }: { cx: number; cy: number; w: number; h: number; stone: string }) {
  const T = [cx, cy - h / 2], R = [cx + w / 2, cy], B = [cx, cy + h / 2], L = [cx - w / 2, cy];
  return (
    <>
      <circle cx={cx} cy={cy} r={w * 1.5} fill={`url(#bgl-${stone})`} />
      <path d={poly([T, R, B, L])} fill={`url(#bg-${stone})`} />
      <path d={poly([T, [cx, cy], L])} fill="#fff" opacity=".45" />
      <path d={poly([[cx, cy], R, B])} fill="#000" opacity=".22" />
      <path d={poly([T, R, B, L])} fill="none" stroke={GEMC[stone][1]} strokeWidth="1" />
    </>
  );
}

const wingTransform = (scale: number) => `translate(110 90) scale(${scale}) translate(-110 -90)`;
const wingMetal = (wing: CrestWing, tier: Tier): MetalName => (wing === 'wx' ? 'amet' : tier);

// The crest's outline as paths: for the shine's clip and the small silhouette.
function Solid({ rank }: { rank: Rank }) {
  const crest = crestOf(rank);
  const tf = wingTransform(crest.wingScale);
  return (
    <>
      {crest.wings.map((wing) => (
        <g key={wing}>
          <path d={PIECE[wing]} transform={tf} />
          <path d={PIECE[wing]} transform={`${FLIP} ${tf}`} />
        </g>
      ))}
      {crest.spikes && (
        <>
          <path d={PIECE.spike} />
          <path d={PIECE.spike} transform={FLIP} />
        </>
      )}
      {crest.crown && <path d={PIECE.crown} />}
      <path d={PIECE.core} />
    </>
  );
}

function Crest({ rank }: { rank: Rank }) {
  const { tier } = rank;
  const crest = crestOf(rank);
  const stone = GEM[tier];
  const tf = wingTransform(crest.wingScale);
  const wing = (
    <>
      {crest.wings.map((name) => (
        <Piece key={name} name={name} metal={wingMetal(name, tier)} />
      ))}
      {crest.studs &&
        [[134, 90], [156, 80]].map(([x, y]) => (
          <g key={x}>
            <circle cx={x} cy={y} r="4" fill={`url(#bg-${stone})`} stroke={METAL[tier][4]} strokeWidth="1" />
            <circle cx={x - 1.2} cy={y - 1.4} r="1.2" fill="#fff" />
          </g>
        ))}
    </>
  );
  const w = crest.gemWidth;
  return (
    <>
      <g className="bw bw-l"><g transform={`${FLIP} ${tf}`}>{wing}</g></g>
      <g className="bw bw-r"><g transform={tf}>{wing}</g></g>
      {crest.spikes && (
        <>
          <Piece name="spike" metal={tier} />
          <Piece name="spike" metal={tier} transform={FLIP} />
        </>
      )}
      {crest.crown && <Piece name="crown" metal={tier} />}
      <Piece name="core" metal={tier} />
      {crest.flare && (
        <g className="flare">
          {Array.from({ length: 8 }, (_, i) => {
            const a = i * 45, len = i % 2 ? 16 : 28;
            const x1 = 100 + Math.cos((a * Math.PI) / 180) * len, y1 = 88 + Math.sin((a * Math.PI) / 180) * len;
            return <path key={i} d={`M100 88L${x1.toFixed(1)} ${y1.toFixed(1)}`} stroke="#fff" strokeOpacity=".7" strokeWidth="1.4" strokeLinecap="round" />;
          })}
        </g>
      )}
      <Gem cx={100} cy={88} w={w} h={w * 1.6} stone={stone} />
    </>
  );
}

const stops = (list: (string | number | undefined)[][]) =>
  list.map(([offset, color, opacity], i) => <stop key={i} offset={offset} stopColor={color as string} stopOpacity={opacity} />);

function Halo({ id, color, opacity }: { id: string; color: string; opacity: number }) {
  return (
    <radialGradient id={id} gradientUnits="userSpaceOnUse" cx="100" cy="88" r="100">
      {stops([[0, color, opacity], [0.55, color, opacity * 0.35], [1, color, 0]])}
    </radialGradient>
  );
}

const rankOfStep = (tier: Tier, step: number): Rank => ({ tier, division: tier === 'elite' ? null : ((5 - step) as Rank['division']) });

// The gradients, clips and filters every badge shares. Mounted once, at the app's root.
export function BadgeDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {(Object.entries(METAL) as [MetalName, string[]][]).map(([name, c]) => (
          <g key={name}>
            <linearGradient id={`bf-${name}`} x1="0" y1="0" x2="0" y2="1">{stops([[0, c[1]], [0.55, c[2]], [1, c[3]]])}</linearGradient>
            <linearGradient id={`bb-${name}`} x1="0" y1="0" x2="0" y2="1">{stops([[0, c[0]], [0.4, c[1]], [0.6, c[3]], [1, c[4]]])}</linearGradient>
          </g>
        ))}
        <linearGradient id="brim" x1="0" y1="0" x2="0" y2="1">{stops([[0, '#fff', 0.9], [0.35, '#fff', 0.25], [0.5, '#fff', 0]])}</linearGradient>
        {Object.entries(GEMC).map(([name, c]) => (
          <g key={name}>
            <radialGradient id={`bg-${name}`} cx=".4" cy=".35" r=".75">{stops([[0, c[0]], [0.35, c[1]], [0.75, c[2]], [1, c[3]]])}</radialGradient>
            <radialGradient id={`bgl-${name}`}>{stops([[0, c[2], 0.75], [1, c[2], 0]])}</radialGradient>
          </g>
        ))}
        <Halo id="bh-bronze" color="#ff9a52" opacity={0.4} />
        <Halo id="bh-silver" color="#d6e4ff" opacity={0.4} />
        <Halo id="bh-gold" color="#ffc83d" opacity={0.5} />
        <Halo id="bh-diamond" color="#5fd3ff" opacity={0.55} />
        <Halo id="bh-elite" color="#c44dff" opacity={0.6} />
        <radialGradient id="br-elite" gradientUnits="userSpaceOnUse" cx="100" cy="88" r="100">{stops([[0, '#ffd6ff', 0.9], [0.6, '#b98bff', 0.35], [1, '#b98bff', 0]])}</radialGradient>
        {Object.entries(PIECE).map(([name, d]) => (
          <clipPath key={name} id={`bk-${name}`}><path d={d} /></clipPath>
        ))}
        {TIERS.map((tier) =>
          [0, 1, 2, 3, 4].map((step) => (
            <clipPath key={`${tier}${step}`} id={`bc-${tier}${step}`}><Solid rank={rankOfStep(tier, step)} /></clipPath>
          )),
        )}
        <filter id="bds" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.6" floodColor="#0a0418" floodOpacity=".6" />
        </filter>
      </defs>
    </svg>
  );
}

// The hard white shine that sweeps across a badge now and then: a wide slash and a thin one, clipped to the crest.
const Shine = ({ id }: { id: string }) => (
  <g clipPath={`url(#${id})`}>
    <g className="shine">
      <path d="M0 0H22L-14 200H-36Z" fill="#fff" opacity=".35" />
      <path d="M30 0H36L0 200H-6Z" fill="#fff" opacity=".35" />
    </g>
  </g>
);

const rays = (n: number, r0: number, R1: number, R2: number, w: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i * 360) / n, R = i % 2 ? R2 : R1;
    return <path key={i} d={poly([pt(r0, a - w), pt(R, a - w / 5), pt(R, a + w / 5), pt(r0, a + w)])} fill="url(#br-elite)" />;
  });

export const rankName = (rank: Rank, tierName: string) => (rank.division === null ? tierName : `${tierName} ${roman[rank.division]}`);

// A Rank as a badge. 'sm' is the crest's flat silhouette in the Tier colour (board rows); 'lg' the
// full badge, alive (Profile); 'still' the full badge without motion (the shelf). Elite swaps the
// pips for a plaque holding `plaque`, the user's "#N" or "top X%".
export function Badge({ rank, tierName, mode, plaque }: { rank: Rank; tierName: string; mode: 'sm' | 'lg' | 'still'; plaque?: string }) {
  const step = rank.division === null ? 4 : 5 - rank.division;
  const style = { '--t': `var(--${rank.tier})` } as CSSProperties;
  const label = rankName(rank, tierName);
  if (mode === 'sm') {
    return (
      <svg className="badge-sm" viewBox="4 12 192 132" style={style} role="img" aria-label={label}>
        <g style={{ fill: 'var(--t)' }}><Solid rank={rank} /></g>
      </svg>
    );
  }
  const elite = rank.tier === 'elite';
  let footer: ReactNode;
  if (elite) {
    footer = (
      <>
        <path d={poly([[82, 150], [118, 150], [124, 160], [118, 170], [82, 170], [76, 160]])} fill={METAL.elite[4]} stroke={METAL.elite[1]} strokeWidth="1.2" strokeLinejoin="round" />
        {plaque && <text x="100" y="165.5" textAnchor="middle" className="plaque" style={{ fontSize: plaque.length > 4 ? 9 : 15 }}>{plaque}</text>}
      </>
    );
  } else {
    footer = [0, 1, 2, 3, 4].map((i) => {
      const x = 76 + i * 12;
      return <path key={i} d={poly([[x, 152.5], [x + 4, 158], [x, 163.5], [x - 4, 158]])} style={{ fill: i <= step ? 'var(--t)' : 'var(--line)' }} />;
    });
  }
  return (
    <svg className={`badge ${mode === 'lg' ? 'b-anim' : ''}`} viewBox="0 0 200 200" style={style} role="img" aria-label={label}>
      {step >= 4 && <circle className="aura" cx="100" cy="88" r="100" fill={`url(#bh-${rank.tier})`} />}
      {elite && <g className="bray"><g className="spin">{rays(24, 40, 100, 82, 1.4)}</g></g>}
      <Crest rank={rank} />
      <Shine id={`bc-${rank.tier}${step}`} />
      {footer}
    </svg>
  );
}
