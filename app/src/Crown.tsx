import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { audioInit, now, sfx, silence } from './rankUpSound.ts';

// The crown moment (design: Celebrations): the Rank-up moment's structure in a shorter form, in
// gold. There is no old crest to crack. One tap opens it: the crown lands with the Rank-up's
// impact sound, the title slams in, the proof appears and the line settles. It borrows the Rank-up's
// stylesheet (the `ru` classes), so the two look like one family.

export type CrownMomentProps = {
  title: string;
  headline: string;
  chips: string[];
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

export function CrownMoment({ title, headline, chips, strings, onContinue }: CrownMomentProps) {
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
    <div ref={root} className="ru" style={{ '--t': 'var(--gold)' } as CSSProperties} onClick={() => tap.current()} role="dialog" aria-modal="true" aria-label={title}>
      <div className="ru-flood" />
      <div className="ru-beam" />
      <div className="ru-in">
        <div className="eyebrow ru-kicker">{phase === 'rest' ? title : strings.news}</div>
        <div className="ru-stage">
          <div className="ru-glow" />
          <div className="ru-new">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="var(--gold)" d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
            </svg>
          </div>
        </div>
        <p className="ru-tap">{strings.tapHint}</p>
        <h1 className="disp ru-name">
          <span className="w">{[...title].map((c, i) => <span key={i} className="l" style={{ '--i': i } as CSSProperties}>{c}</span>)}</span>
        </h1>
        <div className="ru-chips">
          {chips.map((chip, i) => <span key={i} style={{ '--i': i } as CSSProperties}>{chip}</span>)}
        </div>
        <p className="ru-msg">{headline}</p>
        <button type="button" className="btn-primary ru-cont" onClick={(e) => { e.stopPropagation(); onContinue(); }}>{strings.continue}</button>
      </div>
      <div className="ru-flash" />
    </div>
  );
}
