import { useEffect, useState } from 'react';
import { useI18n } from './i18n.ts';
import { Spotlight } from './Spotlight.tsx';

// The Practice Session's script: coach marks over the real Home, Day sheet, Session screen and
// summary. A step ringing a button moves on when the screen shows its effect, not when the tap
// lands, so a tap that does nothing, or a Set logged some other way, never skips ahead. The screens
// are read as they are drawn (a few class names), so they carry no tutorial code of their own.

type Guide = ReturnType<typeof useI18n>['t']['tutorial']['guide'];
type Step = {
  target: string;
  text: keyof Guide;
  act: 'next' | 'tap';
  count?: string;
  // Once the target has been on screen: whether the step's action has happened.
  done?: () => boolean;
};

const $ = (selector: string) => document.querySelector(selector);
const logged = () => document.querySelectorAll('.sets-done .set.done').length;
// The Set still to do in the first or second Exercise, and the ✓ that logs it.
const nextCheck = (exercise: 1 | 2) => `.session > section:nth-of-type(${exercise}) .set:not(.done):not(.upcoming) .check`;

const steps: Step[] = [
  { target: '[data-coach="start"]', text: 'start', act: 'tap', done: () => !!$('dialog.pick[open]') },
  { target: '.sheet.pick .day-row', text: 'pick', act: 'tap', done: () => !!$('.s-head') },
  { target: '.session .go-heavier .badge', text: 'heavier', act: 'next' },
  { target: nextCheck(1), text: 'warm', act: 'tap', done: () => logged() >= 1 },
  { target: nextCheck(1), text: 'work', act: 'tap', done: () => logged() >= 2 },
  { target: '.rir', text: 'rir', act: 'tap', done: () => !$('.rir') },
  { target: '.sets-done .set.done:nth-child(2) .check', text: 'unlog', act: 'tap', done: () => logged() < 2 },
  { target: '.session > section:nth-of-type(1) .set:not(.done):not(.upcoming) .xmark + .cell', text: 'edit', act: 'tap', done: () => !!$('dialog[open] .keypad') },
  { target: '.keypad .pad-grid .pad-key:nth-child(8)', text: 'key8', act: 'tap', done: () => $('.keypad .pad-value')?.textContent === '8' },
  { target: '.keypad .btn-primary', text: 'keyDone', act: 'tap', done: () => !$('dialog[open] .keypad') },
  { target: nextCheck(1), text: 'relog', act: 'tap', done: () => logged() >= 2 },
  { target: '.sets-done .set.done:has(.pr-points)', text: 'pr', act: 'next' },
  { target: nextCheck(1), text: 'set3', act: 'tap', count: '1 / 5', done: () => logged() >= 3 },
  { target: nextCheck(1), text: 'rest', act: 'tap', count: '2 / 5', done: () => logged() >= 4 },
  { target: nextCheck(2), text: 'row', act: 'tap', count: '3 / 5', done: () => logged() >= 5 },
  { target: nextCheck(2), text: 'row', act: 'tap', count: '4 / 5', done: () => logged() >= 6 },
  { target: nextCheck(2), text: 'row', act: 'tap', count: '5 / 5', done: () => logged() >= 7 },
  { target: '.s-finish', text: 'finish', act: 'tap', done: () => !!$('.summary-tag') },
  { target: '.tutorial .card', text: 'dots', act: 'next' },
  { target: '.tutorial .card .btn-primary', text: 'focus', act: 'tap' },
];

export function Guide({ onSkip }: { onSkip: () => void }) {
  const g = useI18n().t.tutorial.guide;
  const [i, setI] = useState(0);
  const step = steps[i]!;
  // To a fixed step, not "one more": the screen can change twice before this step's watcher is replaced.
  const advance = () => setI(Math.min(i + 1, steps.length - 1));
  useEffect(() => {
    if (!step.done) return;
    // A step can't finish before its target has been shown: the RIR chips, for one, are drawn a moment after the Set they follow.
    let seen = false;
    const check = () => {
      seen ||= !!$(step.target);
      if (seen && step.done!()) advance();
    };
    check();
    const changed = new MutationObserver(check);
    changed.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['open'] });
    return () => changed.disconnect();
  }, [step]);
  return <Spotlight target={step.target} text={g[step.text]} act={step.act} count={step.count} onSkip={onSkip} onNext={() => step.act === 'next' && advance()} />;
}
