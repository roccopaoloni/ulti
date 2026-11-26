import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { audioInit, now, sfx, silence } from './rankUpSound.ts';

// The crown moment (design: Celebrations): the Rank-up moment's structure in a shorter form, in
// gold. There is no old crest to crack. One tap opens it: the crown lands with the Rank-up's
// impact sound, the title slams in, the proof appears and the line settles. It borrows the Rank-up's
// stylesheet (the `ru` classes), so the two look like one family. The look is the Spotlight: a hard-edged
// cone of light from the top of the screen onto a polished gold crown (design: Celebrations).

export type CrownMomentProps = {
  title: string;
  label: string;
  headline: string;
  chips: string[];
  // Several wins: one card per win (the Group, then its Period, points and ties) in place of the chips.
  wins?: { group: string; sub: string }[];
  strings: { news: string; tapHint: string; continue: string };
  onContinue: () => void;
};

const reducedMotion = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

// The title keeps its spaces: one nowrap span per word, laid out by the heading's gap, so the words wrap
// onto lines as whole words and never run together.
function words(title: string) {
  let i = 0;
  return title.split(' ').map((word, w) => (
    <span key={w} className="w">{[...word].map((c) => <span key={i} className="l" style={{ '--i': i++ } as CSSProperties}>{c}</span>)}</span>
  ));
}

// The crown as polished gold metal lit from above, in the Rank crests' craft: a face, a bevel bright
// along the top, a fine rim, a soft shadow and no outlines. Its gradients are defined inline.
const BODY = 'M34 140L24 58L68 96L100 34L132 96L176 58L166 140Z';
const BAND = 'M32 140H168L164 166Q100 174 36 166Z';

function Piece({ d, face, clip }: { d: string; face: string; clip: string }) {
  return (
    <g filter="url(#ck-ds)">
      <path d={d} fill={`url(#${face})`} />
      <path d={d} fill="none" stroke="url(#ck-b)" strokeWidth="7" clipPath={`url(#${clip})`} />
      <path d={d} fill="none" stroke="url(#ck-rim)" strokeWidth="1.1" />
    </g>
  );
}

function Orb({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g filter="url(#ck-ds)">
      <circle cx={x} cy={y} r={r} fill="url(#ck-orb)" />
      <circle cx={x - r * 0.32} cy={y - r * 0.38} r={r * 0.3} fill="#fff" opacity=".85" />
      <circle cx={x} cy={y} r={r} fill="none" stroke="url(#ck-rim)" strokeWidth="1" />
    </g>
  );
}

function Gem({ x, y, w, h, fill, glow }: { x: number; y: number; w: number; h: number; fill: string; glow?: boolean }) {
  const T = `${x} ${y - h / 2}`, R = `${x + w / 2} ${y}`, B = `${x} ${y + h / 2}`, L = `${x - w / 2} ${y}`;
  return (
    <>
      {glow && <circle cx={x} cy={y} r={w * 1.6} fill="url(#ck-ruby-g)" />}
      <path d={`M${T}L${R}L${B}L${L}Z`} fill={`url(#${fill})`} />
      <path d={`M${T}L${x} ${y}L${L}Z`} fill="#fff" opacity=".45" />
      <path d={`M${x} ${y}L${R}L${B}Z`} fill="#000" opacity=".22" />
    </>
  );
}

// `mini` is the small flat crown on a win's card: it uses the gradients the big crown defines.
function CrownMetal({ className, mini }: { className: string; mini?: boolean }) {
  return (
    <svg className={className} viewBox={mini ? '14 20 172 160' : '0 0 200 180'} aria-hidden="true">
      {!mini && <defs>
        <linearGradient id="ck-face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd75e" /><stop offset=".55" stopColor="#e8a51c" /><stop offset="1" stopColor="#9a6205" /></linearGradient>
        <linearGradient id="ck-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff7d1" /><stop offset=".4" stopColor="#ffd75e" /><stop offset=".6" stopColor="#9a6205" /><stop offset="1" stopColor="#4a2c00" /></linearGradient>
        <linearGradient id="ck-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset=".35" stopColor="#fff" stopOpacity=".25" /><stop offset=".5" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <linearGradient id="ck-band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe58a" /><stop offset=".5" stopColor="#d9981a" /><stop offset="1" stopColor="#7a4a02" /></linearGradient>
        <radialGradient id="ck-orb" cx=".38" cy=".32" r=".75"><stop offset="0" stopColor="#fff7d1" /><stop offset=".35" stopColor="#ffd75e" /><stop offset=".75" stopColor="#e8a51c" /><stop offset="1" stopColor="#7a4a02" /></radialGradient>
        <radialGradient id="ck-ruby" cx=".4" cy=".35" r=".75"><stop offset="0" stopColor="#fff" /><stop offset=".35" stopColor="#ff8cc0" /><stop offset=".75" stopColor="#ff2d87" /><stop offset="1" stopColor="#7a0b3c" /></radialGradient>
        <radialGradient id="ck-ruby-g"><stop offset="0" stopColor="#ff2d87" stopOpacity=".75" /><stop offset="1" stopColor="#ff2d87" stopOpacity="0" /></radialGradient>
        <radialGradient id="ck-amber" cx=".4" cy=".35" r=".75"><stop offset="0" stopColor="#fff6e0" /><stop offset=".35" stopColor="#ffd08a" /><stop offset=".75" stopColor="#ff9a2e" /><stop offset="1" stopColor="#7a3a05" /></radialGradient>
        <clipPath id="ck-body"><path d={BODY} /></clipPath>
        <clipPath id="ck-bandclip"><path d={BAND} /></clipPath>
        <clipPath id="ck-all"><path d={BODY} /><path d={BAND} /></clipPath>
        <filter id="ck-ds" x="-20%" y="-20%" width="140%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="2.2" floodColor="#0a0418" floodOpacity=".6" /></filter>
      </defs>}
      <Piece d={BODY} face="ck-face" clip="ck-body" />
      <g clipPath="url(#ck-body)">
        <path d="M24 58L68 96L34 140Z" fill="#fff" opacity=".2" />
        <path d="M100 34L132 96L100 140L68 96Z" fill="#fff" opacity=".16" />
        <path d="M176 58L166 140L132 96Z" fill="#000" opacity=".2" />
        <path d="M68 96L100 140L34 140Z" fill="#000" opacity=".12" />
      </g>
      <Orb x={24} y={55} r={8.5} /><Orb x={100} y={31} r={10.5} /><Orb x={176} y={55} r={8.5} />
      <Piece d={BAND} face="ck-band" clip="ck-bandclip" />
      <path d="M40 152H160" stroke="#4a2c00" strokeOpacity=".35" strokeWidth="1.4" />
      <path d="M40 154H160" stroke="#fff" strokeOpacity=".3" strokeWidth="1" />
      <Gem x={62} y={153} w={11} h={15} fill="ck-amber" /><Gem x={138} y={153} w={11} h={15} fill="ck-amber" /><Gem x={100} y={152} w={15} h={25} fill="ck-ruby" glow />
      {!mini && <g clipPath="url(#ck-all)"><g className="ck-shine"><path d="M70 0H92L56 190H34Z" fill="#fff" opacity=".35" /><path d="M100 0H106L70 190H64Z" fill="#fff" opacity=".35" /></g></g>}
    </svg>
  );
}

export function CrownMoment({ title, label, headline, chips, wins, strings, onContinue }: CrownMomentProps) {
  const root = useRef<HTMLDivElement>(null);
  const tap = useRef<() => void>(() => {});
  const [phase, setPhase] = useState<'news' | 'rest'>('news');

  useEffect(() => {
    const el = root.current!;
    const timers: number[] = [];
    let started = false, firedAt = 0, done = false, alive = true;
    const at = (ms: number, f: () => void) => timers.push(window.setTimeout(() => alive && f(), ms));
    const finish = () => {
      done = true;
      el.classList.add('fired', 'slam', 'stats', 'msg', 'flood', 'beam', 'skip');
      setPhase('rest');
    };
    tap.current = () => {
      if (done) return;
      if (!started) {
        started = true;
        firedAt = performance.now();
        audioInit();
        el.classList.add('started', 'fired', 'flash', 'flood', 'beam', 'zoom', 'shake');
        sfx.impact({ lvl: 2 }, now());
        try {
          navigator.vibrate?.([30, 40, 80]);
        } catch {
          // Not every phone can vibrate.
        }
        at(500, () => el.classList.add('slam'));
        at(1000, () => el.classList.add('stats'));
        at(1600, () => {
          el.classList.add('msg');
          setPhase('rest');
        });
      } else if (performance.now() - firedAt > 800) {
        timers.forEach(clearTimeout);
        silence();
        finish();
      }
    };
    if (reducedMotion()) {
      // Reduced motion: the end state, with no animation, no sound and no vibration.
      started = true;
      el.classList.add('started');
      finish();
    }
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      silence();
    };
  }, []);

  return (
    <div ref={root} className={`ru ru-crown${wins ? ' ck-many' : ''}`} style={{ '--t': 'var(--gold)' } as CSSProperties} onClick={() => tap.current()} role="dialog" aria-modal="true" aria-label={title}>
      <div className="ru-flood" />
      <div className="ck-beam" aria-hidden="true">
        <div className="ck-cone c1" />
        <div className="ck-cone c2" />
        <div className="ck-cone c3" />
        <div className="ck-pool" />
      </div>
      <div className="ru-in">
        <div className="eyebrow ru-kicker">{phase === 'rest' ? label : strings.news}</div>
        <div className="ru-stage">
          <div className="ru-glow" />
          <CrownMetal className="ck-crown" />
        </div>
        <p className="ru-tap">{strings.tapHint}</p>
        <h1 className="disp ru-name">
          {words(title)}
        </h1>
        {wins ? (
          <div className="ck-wins">
            {wins.map((w, i) => (
              <div key={i} className="ck-win" style={{ '--i': i } as CSSProperties}>
                <CrownMetal className="ck-mini" mini />
                <div className="ck-tx"><div className="ck-nm">{w.group}</div><div className="ck-sub">{w.sub}</div></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="ru-chips">
            {chips.map((chip, i) => <span key={i} style={{ '--i': i } as CSSProperties}>{chip}</span>)}
          </div>
        )}
        <p className="ru-msg">{headline}</p>
        <button type="button" className="btn-primary ru-cont" onClick={(e) => { e.stopPropagation(); onContinue(); }}>{strings.continue}</button>
      </div>
      <div className="ru-flash" />
    </div>
  );
}
