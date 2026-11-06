import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from './i18n.ts';

// A coach mark: a ring around one real element, everything else dimmed and not tappable, and a
// callout above or below the ring. `act="next"` shows a Got it button; `act="tap"` waits for a tap
// on the ringed element, which is passed through to it. Skip lives in the callout. Reused by the
// Tutorial's Home stops and (#194) over the Session screen.

type Box = { left: number; top: number; width: number; height: number };
const pad = 6;
const gap = 14;

export function Spotlight({ target, text, act, onNext, onSkip }: {
  target: string;
  text: string;
  act: 'next' | 'tap';
  onNext: () => void;
  onSkip: () => void;
}) {
  const u = useI18n().t.tutorial;
  const ring = useRef<HTMLDivElement>(null);
  const callout = useRef<HTMLDivElement>(null);
  const box = useRef<Box | null>(null);
  const element = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState<Box | null>(null);
  const [top, setTop] = useState(0);

  const place = () => {
    // The element may not be there yet (a card still loading): look again on the next place().
    const el = (element.current?.isConnected ? element.current : document.querySelector<HTMLElement>(target)) ?? null;
    element.current = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const b = { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
    box.current = b;
    setShown(b);
    const ch = callout.current?.offsetHeight ?? 0;
    const below = b.top + b.height + gap;
    const above = b.top - ch - gap;
    setTop(below + ch < window.innerHeight - 12 ? below : Math.max(8, above));
  };

  // Bring the element into view with room for the callout, then place the ring.
  useLayoutEffect(() => {
    let tries = 0;
    let frame = 0;
    element.current = null;
    const find = () => {
      const el = document.querySelector<HTMLElement>(target);
      if (!el) {
        if (tries++ < 120) frame = requestAnimationFrame(find);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight - 170) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      place();
    };
    find();
    return () => cancelAnimationFrame(frame);
  }, [target, text]);

  // The ring follows its element: scrolling, resizing, and a sheet or keypad that has finished sliding in.
  useEffect(() => {
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('animationend', place, true);
    document.addEventListener('transitionend', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('animationend', place, true);
      document.removeEventListener('transitionend', place, true);
    };
  }, [target]);

  // The callout's own height decides where it goes, so place again once it has rendered.
  useLayoutEffect(place, [shown?.top, shown?.height, text]);

  const nudge = () => {
    const el = ring.current;
    if (!el) return;
    el.classList.remove('nudge');
    void el.offsetWidth;
    el.classList.add('nudge');
  };
  const tapped = (event: React.MouseEvent) => {
    const b = box.current;
    if (act === 'tap' && b && event.clientX >= b.left && event.clientX <= b.left + b.width && event.clientY >= b.top && event.clientY <= b.top + b.height) {
      element.current?.click();
      onNext();
    } else nudge();
  };

  return (
    <div className="spot-layer" onClick={tapped}>
      {shown && <div ref={ring} className={`spot-ring${act === 'tap' ? ' tap' : ''}`} style={shown} />}
      <div ref={callout} className="spot-callout" role="dialog" aria-label={text} style={{ top, visibility: shown ? 'visible' : 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <p>{text}</p>
        <div className="row">
          <button type="button" className="cskip" onClick={onSkip}>{u.skip}</button>
          {act === 'next' ? (
            <button type="button" className="next" onClick={onNext}>{u.coach.gotIt}</button>
          ) : (
            <span className="hint">{u.coach.tapHint}</span>
          )}
        </div>
      </div>
    </div>
  );
}
