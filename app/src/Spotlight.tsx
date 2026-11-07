import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from './i18n.ts';

// A coach mark: a ring around one real element, everything else dimmed and not tappable, and a
// callout above or below the ring. `act="next"` shows a Got it button; `act="tap"` waits for a tap
// on the ringed element, which is passed through to it (to the button under the finger, when the ring
// holds several). Skip lives in the callout, with an optional count ("2 / 5"). Used by the
// Tutorial's Home stops and the Practice Session's script. A target inside a sheet (a modal dialog,
// which sits above everything else) gets the layer inside that sheet, and the callout clear of it.

type Box = { left: number; top: number; width: number; height: number };
const pad = 6;
const gap = 14;

export function Spotlight({ target, text, act, count, onNext, onSkip }: {
  target: string;
  text: string;
  act: 'next' | 'tap';
  count?: string;
  onNext: () => void;
  onSkip: () => void;
}) {
  const u = useI18n().t.tutorial;
  const ring = useRef<HTMLDivElement>(null);
  const callout = useRef<HTMLDivElement>(null);
  const box = useRef<Box | null>(null);
  const element = useRef<HTMLElement | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [shown, setShown] = useState<Box | null>(null);
  const [top, setTop] = useState(0);

  const place = () => {
    // The element may not be there yet (a card still loading): look again on the next place().
    const el = (element.current?.isConnected ? element.current : document.querySelector<HTMLElement>(target)) ?? null;
    element.current = el;
    if (!el) {
      box.current = null;
      setShown(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const b = { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
    box.current = b;
    setShown((was) => (was && was.left === b.left && was.top === b.top && was.width === b.width && was.height === b.height ? was : b));
    // The callout stays clear of the ring, and of the whole sheet the ring is in.
    const sheet = el.closest('dialog')?.getBoundingClientRect();
    const ch = callout.current?.offsetHeight ?? 0;
    const below = (sheet ? sheet.bottom : b.top + b.height) + gap;
    const above = (sheet ? sheet.top : b.top) - ch - gap;
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
        if (tries++ < 600) frame = requestAnimationFrame(find);
        return;
      }
      setHost(el.closest('dialog'));
      const r = el.getBoundingClientRect();
      if (!el.closest('dialog') && (r.top < 60 || r.bottom > window.innerHeight - 170)) el.scrollIntoView({ block: 'center', behavior: 'instant' });
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
    // Rows that appear above it, chips that come and go: the ring follows the element when the page changes.
    let pending = 0;
    const changed = new MutationObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(place);
    });
    changed.observe(document.body, { childList: true, subtree: true });
    return () => {
      changed.disconnect();
      cancelAnimationFrame(pending);
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
      const under = document.elementsFromPoint(event.clientX, event.clientY).find((el) => !layer.current?.contains(el));
      const button = under?.closest<HTMLElement>('button');
      (button && element.current?.contains(button) ? button : element.current)?.click();
      onNext();
    } else nudge();
  };

  const content = (
    <div ref={layer} className="spot-layer" onClick={tapped}>
      {shown && <div ref={ring} className={`spot-ring${act === 'tap' ? ' tap' : ''}`} style={shown} />}
      <div ref={callout} className="spot-callout" role="dialog" aria-label={text} style={{ top, visibility: shown ? 'visible' : 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <p>{text}</p>
        <div className="row">
          <span className="left">
            {count && <span className="count">{count}</span>}
            <button type="button" className="cskip" onClick={onSkip}>{u.skip}</button>
          </span>
          {act === 'next' ? (
            <button type="button" className="next" onClick={onNext}>{u.coach.gotIt}</button>
          ) : (
            <span className="hint">{u.coach.tapHint}</span>
          )}
        </div>
      </div>
    </div>
  );
  return host ? createPortal(content, host) : content;
}
