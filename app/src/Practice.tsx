import type { Units } from '@ulti/rules';
import { useEffect, useState } from 'react';
import { useI18n } from './i18n.ts';
import { endPractice, PRACTICE_SEED_SESSIONS, startPractice } from './practice.ts';
import { SessionScreen, StartSession, useLogging } from './SessionScreen.tsx';
import type { Training } from './training.ts';

// The Practice Session of the Tutorial: the real Home button, Day sheet, Session screen and summary,
// on a throwaway training that is deleted when this unmounts (finishing, or skipping the Tutorial).
export function Practice({ real, units, onDone }: { real: Training; units: Units; onDone: () => void }) {
  const { t } = useI18n();
  const [practice, setPractice] = useState<Training | null>(null);
  useEffect(() => {
    let opened: Training | undefined;
    let left = false;
    startPractice(real, { dayName: t.tutorial.practiceDay, now: () => new Date(), timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone }).then((started) => {
      if (left) endPractice(started);
      else {
        opened = started;
        setPractice(started);
      }
    });
    return () => {
      left = true;
      if (opened) endPractice(opened);
    };
    // The Routine Day is named once, in the language the Practice Session starts in.
  }, [real]); // eslint-disable-line react-hooks/exhaustive-deps
  return practice && <Flow practice={practice} units={units} onDone={onDone} />;
}

function Flow({ practice, units, onDone }: { practice: Training; units: Units; onDone: () => void }) {
  const { t } = useI18n();
  const logging = useLogging(practice);
  if (logging.open) {
    return (
      <SessionScreen
        training={practice}
        units={units}
        layout="list"
        practice
        onLeave={async () => {
          await logging.leave();
          // Past the seeded Sessions, the Practice Session was finished; otherwise the lifter only stepped back.
          if (!(await practice.sessionInProgress()) && (await practice.pastSessions()).length > PRACTICE_SEED_SESSIONS) onDone();
        }}
      />
    );
  }
  return (
    <main className="screen practice-home">
      <span className="practice-tag">{t.tutorial.practice}</span>
      <StartSession logging={logging} training={practice} practice />
    </main>
  );
}
