import type { CSSProperties, ReactNode } from 'react';
import { useI18n } from './i18n.ts';
import { backIcon } from './icons.tsx';
import { goBack } from './navigation.ts';

// A screen that opens on top of a tab: its own URL, a ← and a title on top, the tab bar still
// below. ← does what the phone's Back does; `parent` is where it goes when the URL was opened
// directly. To add one: give it a path under its tab's in navigation.ts, then render it in
// place of the tab's content in App.tsx.
// `colour` (a CSS colour) tints the header with a Routine Day's colour.
export function SubScreen({ title, parent, colour, children }: { title: string; parent: string; colour?: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <>
      <header className={`subhead${colour ? ' tinted' : ''}`} style={{ '--c': colour } as CSSProperties}>
        <button type="button" className="iconbtn back" aria-label={t.back} onClick={() => goBack(parent)}>
          {backIcon}
        </button>
        <h1 className="disp title">{title}</h1>
      </header>
      {children}
    </>
  );
}
