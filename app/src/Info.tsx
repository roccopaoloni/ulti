import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useI18n, type Term } from './i18n.ts';

// The ⓘ next to a glossary term: it opens a sheet that explains the term in plain language.
export function Info({ term }: { term: Term }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const { term: name, explanation } = t.glossary[term];

  return (
    <>
      <button
        type="button"
        className="info"
        aria-label={name}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <span aria-hidden="true">i</span>
      </button>
      {createPortal(
        <dialog
          ref={dialog}
          className="sheet"
          aria-label={name}
          // A tap on the backdrop lands on the dialog itself and closes it.
          onClick={(event) => {
            // React passes portal events up the component tree; keep clicks and submits away from the parent.
            event.stopPropagation();
            if (event.target === event.currentTarget) event.currentTarget.close();
          }}
          onSubmit={(event) => event.stopPropagation()}
        >
          <div className="sheet-body">
            <h2 className="disp sheet-title">{name}</h2>
            <p>{explanation}</p>
            <form method="dialog">
              <button className="btn-ghost">{t.close}</button>
            </form>
          </div>
        </dialog>,
        document.body,
      )}
    </>
  );
}
