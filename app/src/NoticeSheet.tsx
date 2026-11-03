import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Sheet } from './GroupsScreens.tsx';
import { useI18n } from './i18n.ts';
import { ImplausibleSet, JumpSet } from './training.ts';

export type NoticeAction = { label: string; onClick?: () => void; variant?: 'primary' | 'ghost' };

// A sheet that says one thing and offers one or more buttons: a title, a line of text and the
// actions. Without an `onClick` an action just closes the sheet. The "too big a jump" warning
// reuses it with a second button.
export function NoticeSheet({
  dialog,
  title,
  text,
  actions,
}: {
  dialog: RefObject<HTMLDialogElement | null>;
  title: string;
  text: ReactNode;
  actions: NoticeAction[];
}) {
  return (
    <Sheet dialog={dialog} label={title}>
      <h2 className="disp sheet-title">{title}</h2>
      <p className="muted">{text}</p>
      {actions.map(({ label, onClick, variant = 'primary' }) => (
        <button
          key={label}
          type="button"
          className={variant === 'primary' ? 'btn-primary' : 'btn-ghost'}
          onClick={() => {
            dialog.current?.close();
            onClick?.();
          }}
        >
          {label}
        </button>
      ))}
    </Sheet>
  );
}

// The sheets for an Implausible Set (spec: Implausible Sets). `refuse` shows the one that fits a
// failed save and resolves to what became of the Set: `null` when the error is not an Implausible
// Set (the caller rethrows), 'refused' when the lifter goes back to the numbers (a Set beyond any
// human always does), 'lifted' when they say they lifted a jump, which the caller then saves.
export function useImplausibleSheet() {
  const { t } = useI18n();
  const ceiling = useRef<HTMLDialogElement>(null);
  const jump = useRef<HTMLDialogElement>(null);
  const [percent, setPercent] = useState(0);
  const answer = useRef<((lifted: boolean) => void) | null>(null);
  const settle = (lifted: boolean) => {
    answer.current?.(lifted);
    answer.current = null;
  };
  // Closing the sheet any other way (Escape, the backdrop) is the same as "Fix it".
  useEffect(() => {
    const dialog = jump.current;
    const close = () => settle(false);
    dialog?.addEventListener('close', close);
    return () => dialog?.removeEventListener('close', close);
  }, []);
  const sheet = (
    <>
      <NoticeSheet dialog={ceiling} title={t.session.implausibleTitle} text={t.session.implausibleText} actions={[{ label: t.session.implausibleFix }]} />
      <NoticeSheet
        dialog={jump}
        title={t.session.jumpTitle(percent)}
        text={t.session.jumpText}
        actions={[
          { label: t.session.jumpFix, variant: 'ghost', onClick: () => settle(false) },
          { label: t.session.jumpLifted, onClick: () => settle(true) },
        ]}
      />
    </>
  );
  function refuse(error: unknown): Promise<'refused' | 'lifted' | null> {
    if (error instanceof ImplausibleSet) {
      ceiling.current?.showModal();
      return Promise.resolve('refused');
    }
    if (error instanceof JumpSet) {
      setPercent(Math.round(error.percent));
      jump.current?.showModal();
      return new Promise((resolve) => {
        answer.current = (lifted) => resolve(lifted ? 'lifted' : 'refused');
      });
    }
    return Promise.resolve(null);
  }
  return { sheet, refuse };
}
