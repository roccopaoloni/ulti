import { streak, weekStamps, weekStart, weeklyTargetOf, type ConsistencyWeek } from '@ulti/rules';
import { useEffect, useState } from 'react';
import { useI18n } from './i18n.ts';
import { today } from './profile.ts';
import type { Profile, Training } from './training.ts';

// This week's progress toward the Weekly Target.
export type WeekProgress = { done: number; target: number; points: number };

export function weekProgress(consistency: ConsistencyWeek[], profile: Profile, day = today()): WeekProgress {
  const week = weekStart(day);
  const found = consistency.find((event) => event.week === week);
  return {
    done: found?.sessionDates.length ?? 0,
    target: found?.weeklyTarget ?? weeklyTargetOf(profile.weeklyTarget, week) ?? 0,
    points: found?.consistencyPoints ?? 0,
  };
}

// ●●○: the Weekly Target's dots, filled one by one. `pop` animates the dot just filled.
export function Dots({ done, target, pop = false }: { done: number; target: number; pop?: boolean }) {
  return (
    <div className="dots" aria-hidden="true">
      {Array.from({ length: target }, (_, i) => (
        <span key={i} className={`dot${i < done ? ' filled' : ''}${pop && i === done - 1 ? ' pop' : ''}`} />
      ))}
    </div>
  );
}

// Home: this week's Weekly Target dots and Points.
export function WeekCard({ training, profile }: { training: Training; profile: Profile }) {
  const { t } = useI18n();
  const c = t.consistency;
  const [progress, setProgress] = useState<WeekProgress | null>(null);
  useEffect(() => {
    training.scoring().then(({ consistency }) => setProgress(weekProgress(consistency, profile)));
  }, [training, profile]);
  if (!progress) return null;
  return (
    <section className="card">
      <div className="eyebrow">{c.thisWeek}</div>
      <Dots done={progress.done} target={progress.target} />
      <p className="muted">
        {c.progress(progress.done, progress.target)} · {c.points(progress.points)}
      </p>
    </section>
  );
}

// Shown when a Session is finished: progress toward the Weekly Target and the points it earned.
export function SessionSummary({ progress, earned, onClose }: { progress: WeekProgress; earned: number; onClose: () => void }) {
  const { t } = useI18n();
  const c = t.consistency;
  return (
    <main className="screen">
      <section className="card">
        <h1 className="disp title">{c.summaryTitle}</h1>
        <Dots done={progress.done} target={progress.target} pop={earned > 0} />
        <p className="muted">{c.progress(progress.done, progress.target)}</p>
        {earned > 0 ? <p>{c.filled}</p> : <p className="muted">{c.notCounted}</p>}
        <p className="disp">{t.session.points(earned)}</p>
        <button type="button" className="btn-primary" onClick={onClose}>
          {c.close}
        </button>
      </section>
    </main>
  );
}

// Profile: the Streak and the Week Stamps earned.
export function StampsCard({ training }: { training: Training }) {
  const { t } = useI18n();
  const c = t.consistency;
  const [weeks, setWeeks] = useState<ConsistencyWeek[] | null>(null);
  useEffect(() => {
    training.scoring().then(({ consistency }) => setWeeks(consistency));
  }, [training]);
  if (!weeks) return null;
  const stamped = weekStamps(weeks);
  return (
    <section className="card">
      <div className="eyebrow">{c.stamps}</div>
      <p className="disp">{c.streak(streak(weeks, today()))}</p>
      {stamped.length === 0 ? (
        <p className="muted">{c.noStamps}</p>
      ) : (
        <div className="stamps">
          {stamped.map((week) => (
            <span key={week} className="stamp">
              {week.slice(5)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
