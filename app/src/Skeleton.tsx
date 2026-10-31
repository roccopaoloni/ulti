import type { CSSProperties } from 'react';

// Shimmering placeholder bars shaped like the content that is loading. Show it only while there is
// no data yet; it fades in after a beat, so data that is a moment away never flashes it.
export function Skeleton({ bars = ['40%', '100%'], card = false }: { bars?: string[]; card?: boolean }) {
  return (
    <div className={`loading${card ? ' card' : ''}`} aria-hidden="true">
      {bars.map((width, index) => (
        <div key={index} className="sk" style={{ '--w': width } as CSSProperties} />
      ))}
    </div>
  );
}
