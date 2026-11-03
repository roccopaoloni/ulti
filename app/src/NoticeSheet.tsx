import { useRef, type ReactNode, type RefObject } from 'react';
import { Sheet } from './GroupsScreens.tsx';
import { useI18n } from './i18n.ts';
import { ImplausibleSet } from './training.ts';

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

// The sheet for a Set beyond any human (spec: Implausible Sets). `refuse` shows it when a save
// failed because the Set is implausible and says whether it did; any other error is left alone.
export function useImplausibleSheet() {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const sheet = (
    <NoticeSheet dialog={dialog} title={t.session.implausibleTitle} text={t.session.implausibleText} actions={[{ label: t.session.implausibleFix }]} />
  );
  function refuse(error: unknown) {
    if (!(error instanceof ImplausibleSet)) return false;
    dialog.current?.showModal();
    return true;
  }
  return { sheet, refuse };
}
