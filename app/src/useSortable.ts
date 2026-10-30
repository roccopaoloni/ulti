import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';

// The space between the items of a sortable list, which the others shift by along with the item.
const GAP = 10;

// Press and slide a ≡ handle to move an item of a list, with a finger or a mouse. Put `list` on the
// list's element and `item(i)` on each of its children, and `handle(i)` on the item's ≡. The item
// follows the pointer and the others make room; `onMove` is called on release if it ended up elsewhere.
export function useSortable(onMove: (from: number, to: number) => void) {
  const list = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number; size: number } | null>(null);
  // Where the items' middles were when the press began, and where the pointer was.
  const start = useRef<{ y: number; middles: number[] } | null>(null);
  const latest = useRef(drag);
  const show = (next: typeof drag) => setDrag((latest.current = next));

  const handle = (from: number) => ({
    onPointerDown(event: PointerEvent<HTMLElement>) {
      const items = [...(list.current?.children ?? [])].map((child) => child.getBoundingClientRect());
      event.currentTarget.setPointerCapture(event.pointerId);
      start.current = { y: event.clientY, middles: items.map((rect) => rect.top + rect.height / 2) };
      show({ from, to: from, dy: 0, size: items[from].height + GAP });
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!start.current || !latest.current) return;
      const dy = event.clientY - start.current.y;
      const centre = start.current.middles[from] + dy;
      const to = start.current.middles.filter((middle, i) => i !== from && middle < centre).length;
      show({ ...latest.current, to, dy });
    },
    onPointerUp() {
      const done = latest.current;
      start.current = null;
      show(null);
      if (done && done.from !== done.to) onMove(done.from, done.to);
    },
    onPointerCancel() {
      start.current = null;
      show(null);
    },
  });

  const item = (i: number) => {
    let style: CSSProperties | undefined;
    if (drag?.from === i) style = { transform: `translateY(${drag.dy}px)`, zIndex: 2, position: 'relative', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' };
    else if (drag && drag.from < drag.to && i > drag.from && i <= drag.to) style = { transform: `translateY(${-drag.size}px)`, transition: 'transform 0.15s' };
    else if (drag && drag.to < drag.from && i >= drag.to && i < drag.from) style = { transform: `translateY(${drag.size}px)`, transition: 'transform 0.15s' };
    else if (drag) style = { transition: 'transform 0.15s' };
    return { style };
  };

  return { list, handle, item };
}
