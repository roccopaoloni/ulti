import { useRef, useState } from 'react';
import { exerciseImages } from './exerciseImages.ts';
import { Sheet } from './GroupsScreens.tsx';
import { useI18n } from './i18n.ts';

// The small picture (the start frame) beside an Exercise in the Picker and the Routine editor.
// Custom Exercises, Exercises with no match, and a picture that can't load (offline, never seen
// before) show nothing, so no broken image is ever left on screen.
export function ExerciseThumb({ exerciseId }: { exerciseId: string }) {
  const [failed, setFailed] = useState(false);
  const images = exerciseImages(exerciseId);
  if (!images || failed) return null;
  return <img className="ex-thumb" src={images.thumb} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

// An Exercise's name in a Session. With pictures it is a button that opens a sheet with the large
// image, looping slowly between the start and the end frame (the start only, for reduced motion).
export function ExerciseName({ exerciseId, name }: { exerciseId: string; name: string }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  const images = exerciseImages(exerciseId);
  if (!images) return <>{name}</>;
  return (
    <>
      <button
        type="button"
        className="ex-name-btn"
        aria-label={t.session.showExercise(name)}
        onClick={() => {
          setOpened(true);
          dialog.current?.showModal();
        }}
      >
        {name}
      </button>
      <Sheet dialog={dialog} label={name}>
        <h2 className="disp sheet-title">{name}</h2>
        {/* The images are only asked for once the sheet is first opened. */}
        {opened && (
          <div className="ex-photo">
            <img src={images.frames[0]} alt={name} />
            <img className="ex-photo-end" src={images.frames[1]} alt="" />
          </div>
        )}
        <button type="button" className="btn-link" onClick={() => dialog.current?.close()}>
          {t.close}
        </button>
      </Sheet>
    </>
  );
}
