import { useState } from 'react';
import { useI18n } from './i18n.ts';
import { Spotlight } from './Spotlight.tsx';

// The Tutorial's last part: three coach marks on the lifter's real Home. Tapping Start session on
// the last one opens the real Day sheet (the tap goes through to the button) and ends the Tutorial.

const stops = [
  { target: '[data-coach="week"]', key: 'week', act: 'next' },
  { target: '[data-coach="tabs"]', key: 'tabs', act: 'next' },
  { target: '[data-coach="start"]', key: 'go', act: 'tap' },
] as const;

export function CoachMarks({ onDone }: { onDone: () => void }) {
  const c = useI18n().t.tutorial.coach;
  const [i, setI] = useState(0);
  const stop = stops[i];
  return <Spotlight target={stop.target} text={c[stop.key]} act={stop.act} onSkip={onDone} onNext={() => (i === stops.length - 1 ? onDone() : setI(i + 1))} />;
}
