import type { Rank, Tier } from '@ulti/rules';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Badge } from './Badge.tsx';
import { audioInit, now, sfx, sfxSuck, silence } from './rankUpSound.ts';

// The Rank-up moment (design: The Rank-up moment), ported from the UI prototype: a full-screen
// sequence in the new Tier's colour. The old crest waits; each tap lands a hit that cracks it
// further; it shatters into the pieces its cracks drew; the new Rank lands and the proof counts
// up. A Division-up skips the cracking. Every sound is played at the moment of the thing it goes
// with, and a skip cuts what is still queued, so sound and picture never come apart.
// The sequence only needs the Ranks and the lines to show, so winning a Period (#27) can reuse it.

type Config = { hits: number; gap: number; parts: number; lvl: number; small?: boolean; beam?: boolean; zoom?: boolean; rays?: boolean; second?: boolean; elite?: boolean };
// Per new Tier: the hits that crack the old crest, the gap between them (ms), how many sparks the
// shatter throws, and which extras it adds.
const CONFIG: Record<Exclude<Tier, 'bronze'>, Config> = {
  silver: { hits: 3, gap: 420, parts: 60, lvl: 1, small: true },
  gold: { hits: 4, gap: 420, parts: 140, lvl: 2, beam: true, zoom: true },
  diamond: { hits: 5, gap: 400, parts: 200, lvl: 3, beam: true, zoom: true, rays: true, second: true },
  elite: { hits: 6, gap: 400, parts: 260, lvl: 4, beam: true, zoom: true, rays: true, second: true, elite: true },
};
// A Division-up: no cracks, a short stamp.
const DIVISION: Config = { hits: 0, gap: 0, parts: 30, lvl: 0, small: true };
const romans = ['', 'I', 'II', 'III', 'IV', 'V'];

type Point = [number, number];
type Bit = { a: Point; b: Point; w: number; h: number };
type Main = { P: Point[]; far: Point };
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const fmt = (p: Point) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;

// Cracks walk out from an impact point as jagged lines that taper and throw off side branches.
// Every piece of crack belongs to the hit that opens it (hits 1..K), so each hit visibly extends
// them. The main cracks continue, unseen, past the edge to cut the shards: the pieces that fly off
// are the pieces the cracks drew.
function crackGeo(K: number) {
  const cx = 100 + rand(-8, 8), cy = 100 + rand(-8, 8), n = 8, base = Math.random() * 45;
  const mains: Main[] = [], bits: Bit[] = [];
  const walk = (x: number, y: number, ang: number, len: number, w0: number, t0: number, t1: number) => {
    const P: Point[] = [[x, y]];
    let a = ang, d = 0;
    while (d < len) {
      a = ang + (a - ang) * 0.55 + (Math.random() - 0.5) * 0.9;
      const st = 4 + Math.random() * 7;
      x += Math.cos(a) * st;
      y += Math.sin(a) * st;
      d += st;
      P.push([x, y]);
    }
    for (let i = 1; i < P.length; i++) {
      const f = i / (P.length - 1);
      bits.push({ a: P[i - 1], b: P[i], w: Math.max(0.35, w0 * (1 - f * 0.9)), h: Math.max(1, Math.min(K, Math.ceil((t0 + (t1 - t0) * f) * K))) });
    }
    return P;
  };
  for (let i = 0; i < n; i++) {
    const ang = ((base + (i * 360) / n + rand(-8, 8)) * Math.PI) / 180, t0 = (i % 3) * 0.24 + Math.random() * 0.05;
    const P = walk(cx, cy, ang, 105 + Math.random() * 25, 2.8, t0, 1);
    for (const q of [0.3, 0.55]) {
      if (Math.random() < 0.75) {
        const j = Math.floor((P.length - 1) * q), side = Math.random() < 0.5 ? -1 : 1;
        walk(P[j][0], P[j][1], ang + side * (0.45 + Math.random() * 0.5), 18 + Math.random() * 26, 1.4, t0 + (1 - t0) * q, 1);
      }
    }
    mains.push({ P, far: [cx + Math.cos(ang) * 260, cy + Math.sin(ang) * 260] });
  }
  return { cx, cy, mains, bits };
}

// One group per hit: a light leak, then each crack as a dark split with a faint lit lower edge,
// grouped by width.
function CrackPaths({ geo, K }: { geo: ReturnType<typeof crackGeo>; K: number }) {
  const seg = (q: Bit) => `M${fmt(q.a)}L${fmt(q.b)}`;
  return (
    <>
      {Array.from({ length: K }, (_, i) => i + 1).map((h) => {
        const bits = geo.bits.filter((q) => q.h === h);
        if (!bits.length) return null;
        const byWidth: Record<string, string[]> = {};
        for (const q of bits) (byWidth[(Math.round(q.w * 2) / 2).toFixed(1)] ??= []).push(seg(q));
        return (
          <g key={h} data-h={h}>
            <path className="lk" d={bits.map(seg).join('')} />
            {Object.entries(byWidth).map(([w, d]) => (
              <g key={w}>
                <path className="lit" d={d.join('')} strokeWidth={w} transform="translate(.6 .9)" />
                <path className="dk" d={d.join('')} strokeWidth={w} />
              </g>
            ))}
          </g>
        );
      })}
    </>
  );
}

export type RankUpChip = { n: number; format: (n: number) => string };
export type RankUpMomentProps = {
  from: Rank;
  to: Rank;
  tierName: string;
  strings: { news: string; tapHint: string; continue: string };
  kicker: string;
  headline: string;
  chips: RankUpChip[];
  onContinue: () => void;
};

const reducedMotion = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff';

type Particle = { k: 'burst' | 'ring' | 'conf' | 'ember' | 'star'; x: number; y: number; vx?: number; vy?: number; life: number; max: number; s?: number; c: string; w?: number; r?: number; vr?: number };

export function RankUpMoment({ from, to, tierName, strings, kicker, headline, chips, onContinue }: RankUpMomentProps) {
  const division = to.tier === from.tier;
  const cfg = division ? DIVISION : CONFIG[to.tier as Exclude<Tier, 'bronze'>];
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tap = useRef<() => void>(() => {});
  const [phase, setPhase] = useState<'news' | 'hidden' | 'rest'>('news');
  const geo = useMemo(() => crackGeo(Math.max(1, cfg.hits)), [cfg.hits]);
  const oldStep = from.division === null ? 4 : 5 - from.division;
  const shards = useMemo(
    () =>
      geo.mains.map((c, i) => {
        const nx = geo.mains[(i + 1) % geo.mains.length];
        const wedge = c.P.concat([c.far, nx.far], nx.P.slice().reverse());
        const clip = wedge.map((p) => `${(p[0] / 2).toFixed(1)}% ${(p[1] / 2).toFixed(1)}%`).join(',');
        const mid = Math.atan2((c.far[1] + nx.far[1]) / 2 - geo.cy, (c.far[0] + nx.far[0]) / 2 - geo.cx), dist = 170 + Math.random() * 120;
        const style = { clipPath: `polygon(${clip})`, '--dx': `${Math.round(Math.cos(mid) * dist)}px`, '--dy': `${Math.round(Math.sin(mid) * dist)}px`, '--r': `${Math.round(Math.random() * 320 - 160)}deg` } as CSSProperties;
        return <div key={i} style={style}><Badge rank={from} tierName={tierName} mode="still" /></div>;
      }),
    [geo, from, tierName],
  );

  useEffect(() => {
    const el = root.current!, cv = canvas.current!;
    const rm = reducedMotion();
    const ctx = cv.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pips = [...el.querySelectorAll<SVGElement>('.ru-new svg .pip')];
    const lit = pips.filter((c) => c.dataset.on);
    if (!rm) pips.forEach((c) => (c.style.fill = 'var(--line)'));
    const spans = [...el.querySelectorAll<HTMLElement>('.ru-chips span')];
    const letters = tierName.length;
    const colors = { t: cssVar(`--${to.tier}`), a: cssVar('--accent'), w: '#ffffff' };
    const timers: number[] = [];
    let stageTimer = 0, raf = 0, parts: Particle[] = [];
    let stage = 0, stageAt = 0, started = false, fired = false, firedAt = 0, idle = false, skipped = false, scale = 1, last = 0, frames = 0, ft = 0, alive = true;
    const at = (ms: number, f: () => void) => timers.push(window.setTimeout(() => alive && f(), ms));
    const finish = () => {
      el.classList.add('fired', 'slam', 'numstamp', 'stats', 'skip');
      if (!division) el.classList.add('flood');
      if (cfg.beam) el.classList.add('beam');
      if (cfg.rays) el.classList.add('rays');
      for (const c of lit) c.style.fill = 'var(--t)';
      spans.forEach((s, i) => (s.textContent = chips[i].format(chips[i].n)));
      setPhase('rest');
      idle = true;
      el.classList.add('idle', 'msg');
    };

    const center = (): Point => {
      const r = el.querySelector('.ru-stage')!.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };
    const leak = (n: number) => {
      const [cx, cy] = center();
      for (let i = 0; i < n * scale; i++) {
        const a = Math.random() * Math.PI * 2, v = 0.05 + Math.random() * 0.15;
        parts.push({ k: 'burst', x: cx + Math.cos(a) * 20, y: cy + Math.sin(a) * 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 500 + Math.random() * 400, s: 1 + Math.random() * 1.5, c: Math.random() < 0.7 ? colors.t : colors.w });
      }
    };
    const burst = (n: number) => {
      const [cx, cy] = center(), cs = [colors.t, colors.w, colors.a];
      for (let i = 0; i < n * scale; i++) {
        const a = Math.random() * Math.PI * 2, v = 0.25 + Math.random() * 0.75;
        parts.push({ k: 'burst', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 600 + Math.random() * 700, s: 1.5 + Math.random() * 2, c: cs[i % 3] });
      }
    };
    const ring = (w = 6) => {
      const [cx, cy] = center();
      parts.push({ k: 'ring', x: cx, y: cy, life: 0, max: 750, w, c: colors.t });
    };
    const confetti = (n: number) => {
      const [cx] = center(), cs = [colors.t, colors.w, colors.a];
      for (let i = 0; i < n * scale; i++) {
        parts.push({ k: 'conf', x: cx + (Math.random() - 0.5) * innerWidth, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 0.12, vy: 0.12 + Math.random() * 0.2, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.02, life: 0, max: 4200, s: 5 + Math.random() * 4, c: cs[i % 3] });
      }
    };
    const ember = () =>
      parts.push({ k: 'ember', x: Math.random() * innerWidth, y: innerHeight + 10, vx: (Math.random() - 0.5) * 0.02, vy: -0.03 - Math.random() * 0.06, life: 0, max: 4000 + Math.random() * 2000, s: 1 + Math.random() * 2, c: Math.random() < 0.5 ? colors.t : colors.a });

    const draw = (dt: number) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const keep: Particle[] = [];
      for (const q of parts) {
        q.life += dt;
        if (q.life > q.max) continue;
        keep.push(q);
        const f = q.life / q.max;
        ctx.globalCompositeOperation = q.k === 'conf' ? 'source-over' : 'lighter';
        if (q.k === 'burst') {
          q.vx! *= 0.985;
          q.vy = q.vy! * 0.985 + 0.0006 * dt;
          q.x += q.vx! * dt;
          q.y += q.vy * dt;
          ctx.globalAlpha = 1 - f;
          ctx.fillStyle = q.c;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.s!, 0, 7);
          ctx.fill();
        } else if (q.k === 'ring') {
          ctx.globalAlpha = 1 - f;
          ctx.strokeStyle = q.c;
          ctx.lineWidth = q.w! * (1 - f) + 1;
          ctx.beginPath();
          ctx.arc(q.x, q.y, 40 + f * 420, 0, 7);
          ctx.stroke();
        } else if (q.k === 'conf') {
          q.x += q.vx! * dt;
          q.y += q.vy! * dt;
          q.r! += q.vr! * dt;
          ctx.globalAlpha = f > 0.8 ? (1 - f) * 5 : 1;
          ctx.fillStyle = q.c;
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.r!);
          ctx.fillRect(-q.s! / 2, -q.s! * 0.8, q.s!, q.s! * 1.6);
          ctx.restore();
        } else if (q.k === 'ember') {
          q.x += q.vx! * dt;
          q.y += q.vy! * dt;
          ctx.globalAlpha = Math.sin(f * Math.PI) * 0.8;
          ctx.fillStyle = q.c;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.s!, 0, 7);
          ctx.fill();
        } else {
          ctx.globalAlpha = Math.sin(f * Math.PI) * (fired ? 0.4 : 0.9);
          ctx.fillStyle = q.c;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.s!, 0, 7);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      parts = keep;
    };
    const loop = (ts: number) => {
      if (!alive) return;
      const dt = last ? Math.min(50, ts - last) : 16;
      last = ts;
      if (frames < 20) {
        frames++;
        ft += dt;
        if (frames === 20 && ft / 20 > 24) scale = 0.5;
      }
      if (cfg.elite && started && !fired && Math.random() < 0.5) parts.push({ k: 'star', x: Math.random() * innerWidth, y: Math.random() * innerHeight, life: 0, max: 2400, s: 0.6 + Math.random() * 1.4, c: '#fff' });
      if (started && !fired && stage >= cfg.hits - 1 && Math.random() < 0.4) leak(1);
      if (idle && Math.random() < 0.25 * scale) ember();
      draw(dt);
      raf = requestAnimationFrame(loop);
    };

    const count = (span: HTMLElement, chip: RankUpChip) => {
      const t0 = performance.now(), d = 700;
      const step = (ts: number) => {
        if (!alive || skipped) return;
        const f = Math.min(1, (ts - t0) / d);
        span.textContent = chip.format(Math.round(chip.n * (1 - Math.pow(1 - f, 3))));
        if (f < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const rest = () => {
      setPhase('rest');
      idle = true;
      el.classList.add('idle', 'msg');
    };

    // The shatter, the new Rank landing and the proof, with each sound on its own visible beat.
    const impact = () => {
      const tm = division ? 0.45 : cfg.small ? 0.72 : cfg.elite ? 1.15 : 1;
      fired = true;
      firedAt = performance.now();
      el.classList.add('fired');
      el.style.setProperty('--glow', String(division ? 0.4 : 1));
      if (!division) el.classList.add('flash');
      if (division) sfx.stamp(now());
      else {
        sfx.impact(cfg, now());
        sfx.payoff(cfg, now());
        try {
          navigator.vibrate?.([30, 40, 80]);
        } catch {
          // Not every phone can vibrate.
        }
      }
      ring(division ? 3 : 6);
      burst(cfg.parts);
      if (cfg.beam) el.classList.add('beam');
      at(50, () => {
        if (!division) el.classList.add('flood');
        if (cfg.zoom) el.classList.add('zoom');
        if (!cfg.small) el.classList.add('shake');
        if (cfg.rays) el.classList.add('rays');
        if (!division) confetti(cfg.elite ? 110 : cfg.small ? 40 : 80);
        el.style.setProperty('--glow', '0.55');
      });
      if (cfg.second) at(250, () => { ring(4); burst(cfg.parts / 3); });
      if (cfg.elite) {
        for (const ms of [900, 1700]) {
          at(ms, () => {
            ring(3);
            el.classList.remove('shake');
            void el.offsetWidth;
            el.classList.add('shake');
          });
        }
      }
      const slamAt = 850 * tm;
      at(slamAt, () => el.classList.add('slam'));
      const stampAt = slamAt + letters * 35 + 150;
      at(stampAt, () => {
        el.classList.add('numstamp');
        if (!division) sfx.stamp(now());
        lit.forEach((c, i) =>
          at(180 + i * 120, () => {
            c.style.fill = 'var(--t)';
            sfx.pip(i, now());
          }),
        );
      });
      at(Math.max(stampAt + 300, 2050 * tm), () => {
        el.classList.add('stats');
        spans.forEach((s, i) => count(s, chips[i]));
      });
      at(Math.max(stampAt + 700, 3250 * tm), rest);
    };
    const fire = () => {
      if (fired) return;
      fired = true;
      clearTimeout(stageTimer);
      setPhase('hidden');
      el.classList.remove('jolt');
      if (cfg.elite) {
        el.classList.add('charge');
        sfxSuck(now(), 0.46);
        at(460, impact);
      } else at(90, impact);
    };
    // Each crack is one hit: the cracks jump outward, the badge jolts, light starts to leak and
    // exactly one sound plays. Hits come faster and harder; the beat after the last one shatters.
    const hit = (n: number) => {
      if (fired) return;
      clearTimeout(stageTimer);
      stage = n;
      stageAt = performance.now();
      const K = cfg.hits, p = n / K;
      if (n > K) {
        fire();
        return;
      }
      el.querySelectorAll<SVGElement>('.ru-cracks [data-h]').forEach((g) => g.classList.toggle('on', Number(g.dataset.h) <= n));
      el.style.setProperty('--leak', (p * p * 0.8).toFixed(2));
      el.style.setProperty('--glow', String(0.15 + 0.75 * p));
      el.style.setProperty('--p', String(0.6 * p));
      if (cfg.elite) el.style.setProperty('--dark', String(0.92 * p));
      el.classList.remove('jolt');
      void el.offsetWidth;
      el.classList.add('jolt');
      sfx.crack(n, K, now());
      leak(4 + n * 4);
      stageTimer = window.setTimeout(() => alive && hit(n + 1), cfg.gap * (1 - 0.4 * p));
    };
    // After a second of reveal, a tap skips to the end: the timers go and so does every sound
    // still queued.
    const skip = () => {
      if (skipped || !fired || performance.now() - firedAt < 1000) return;
      skipped = true;
      timers.forEach(clearTimeout);
      silence();
      parts = parts.filter((q) => q.k === 'ember');
      finish();
    };
    tap.current = () => {
      if (rm) return;
      if (!started) {
        started = true;
        audioInit();
        el.classList.add('started');
        hit(1);
        return;
      }
      if (!fired) {
        if (performance.now() - stageAt > 150) hit(stage + 1);
        return;
      }
      skip();
    };

    if (rm) {
      // Reduced motion: the end state, with no animation, no sound and no vibration.
      started = fired = skipped = true;
      el.classList.add('started');
      finish();
      return () => {
        alive = false;
      };
    }
    raf = requestAnimationFrame(loop);
    if (division) {
      audioInit();
      started = true;
      el.classList.add('started');
      at(1000, impact);
    }
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      clearTimeout(stageTimer);
      cancelAnimationFrame(raf);
      silence();
    };
    // The sequence is set up once for the Ranks it is given.
  }, []);

  const style = { '--t': `var(--${to.tier})`, '--t0': `var(--${from.tier})` } as CSSProperties;
  return (
    <div ref={root} className={`ru ${cfg.elite ? 'elite' : ''} ${division ? 'divmode' : ''}`} style={style} onClick={() => tap.current()} role="dialog" aria-modal="true" aria-label={tierName}>
      <div className="ru-dark" />
      <div className="ru-flood" />
      <div className="ru-rays" />
      <div className="ru-beam" />
      <div className="ru-vig" />
      <div className="ru-in">
        <div className="eyebrow ru-kicker" style={{ opacity: phase === 'hidden' ? 0 : 1 }}>{phase === 'rest' ? kicker : strings.news}</div>
        <div className="ru-stage">
          <div className="ru-glow" />
          <div className="ru-old">
            <div className="ru-whole">
              <Badge rank={from} tierName={tierName} mode="lg" />
              <svg className="ru-cracks" viewBox="0 0 200 200" aria-hidden="true">
                <g clipPath={`url(#bc-${from.tier}${oldStep})`}>
                  <CrackPaths geo={geo} K={Math.max(1, cfg.hits)} />
                </g>
              </svg>
            </div>
            <div className="ru-shards">{shards}</div>
          </div>
          <div className="ru-new"><Badge rank={to} tierName={tierName} mode="lg" /></div>
        </div>
        <p className="ru-tap">{division ? '' : strings.tapHint}</p>
        <h1 className="disp ru-name">
          <span className="w">{[...tierName].map((c, i) => <span key={i} className="l" style={{ '--i': i } as CSSProperties}>{c}</span>)}</span>
          {to.division !== null && <span className="ru-div">{romans[to.division]}</span>}
        </h1>
        <div className="ru-chips">
          {chips.map((c, i) => <span key={i} style={{ '--i': i } as CSSProperties}>{c.format(0)}</span>)}
        </div>
        <p className="ru-msg">{phase === 'rest' ? headline : ''}</p>
        <button type="button" className="btn-primary ru-cont" onClick={(e) => { e.stopPropagation(); onContinue(); }}>{strings.continue}</button>
      </div>
      <div className="ru-flash" />
      <canvas ref={canvas} className="ru-cv" />
    </div>
  );
}
