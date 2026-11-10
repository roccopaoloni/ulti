import { expect, test } from 'vitest';
import { recommendFatigue, recommendStall, type Session, type TrainingHistory } from '../index.ts';
import { randomSource } from './lifters.ts';

// Fatigue (ADR 0009) on simulated lifters of one lift, run through the real rules, to check the
// thresholds do not cry wolf. THE MODEL, every number an assumption:
//   - The lifter plans a weight from their true e1RM for RIR 3 and trains 5 reps for 3 Sets, 3 Sessions a week
//     (Mon, Wed, Fri) for the 8 lead-in weeks and the 13 weeks of a Season.
//   - Day to day their performance varies by 2% around the true e1RM (as in lifters.ts). At the
//     planned weight that is how many reps they have in them; RIR is that figure less the reps done,
//     rounded to a whole number and capped at 4 (RIR is a judgement, and the chip is whole numbers).
//   - A steadily progressing intermediate gains 6% of e1RM over a Season (lifters.ts: the 50th percentile).
const REPS = 5;
const TARGET_RIR = 3;
const PLATE_KG = 2.5;
const LEAD_IN_WEEKS = 8;
const SEASON_WEEKS = 13;
const PERFORMANCE_SPREAD = 0.02;
const INTERMEDIATE_SEASON_GAIN = 0.06;
const LIFTERS = 200;
const CREEP_PER_SESSION = 0.026;
const bench = { repMin: 3, repMax: 8, incrementKg: PLATE_KG };

function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

// One Session at a planned weight on a day the lifter is able to lift `performanceKg` as an e1RM.
function loggedSession(localDate: string, weightKg: number, performanceKg: number): Session {
  const repsInTank = 30 * (performanceKg / weightKg - 1);
  const reps = repsInTank < REPS ? Math.max(1, Math.floor(repsInTank)) : REPS;
  const rir = repsInTank < REPS ? 0 : Math.min(4, Math.round(repsInTank - REPS));
  return { localDate, sets: [0, 1, 2].map((i) => ({ id: `${localDate}-${i}`, exercise: 'bench-press', custom: false, weightKg, reps, rir })) };
}

const planned = (trueE1rm: number) => Math.floor(trueE1rm / (1 + (REPS + TARGET_RIR) / 30) / PLATE_KG) * PLATE_KG;

// The days Fatigue is flagged, as runs: a run of consecutive Sessions flagged is one false alarm.
function alarms(sessions: Session[], from: number): number[] {
  const flaggedAt: number[] = [];
  let was = false;
  for (let n = from; n <= sessions.length; n++) {
    const now = recommendFatigue({ userId: 'sim', sessions: sessions.slice(0, n), weeklyTargets: [] }, 'bench-press', bench) !== undefined;
    if (now && !was) flaggedAt.push(n - 1);
    was = now;
  }
  return flaggedAt;
}

test('a steadily progressing intermediate gets at most 1 false Fatigue per Season per lift', () => {
  const random = randomSource(205);
  let total = 0;
  for (let lifter = 0; lifter < LIFTERS; lifter++) {
    const start = 60 + random.next() * 80;
    const sessions: Session[] = [];
    for (let week = 0; week < LEAD_IN_WEEKS + SEASON_WEEKS; week++) {
      // The plan follows the true e1RM, which rises evenly over the Season.
      const trueE1rm = start * (1 + (INTERMEDIATE_SEASON_GAIN * Math.max(0, week - LEAD_IN_WEEKS)) / SEASON_WEEKS);
      for (const weekday of [0, 2, 4]) {
        const localDate = addDays('2026-08-17', week * 7 + weekday);
        sessions.push(loggedSession(localDate, planned(trueE1rm), trueE1rm * (1 + random.normal(0, PERFORMANCE_SPREAD))));
      }
    }
    const falseAlarms = alarms(sessions, LEAD_IN_WEEKS * 3).length;
    total += falseAlarms;
  }
  // "At most 1 per Season per lift" as the average over the lifters (0.095 now).
  expect(total / LIFTERS).toBeLessThanOrEqual(1);
});

test('a lifter with built-in effort creep is flagged within 4 Sessions of it starting, mostly within 3', () => {
  const random = randomSource(206);
  const flaggedAfter: number[] = [];
  for (let lifter = 0; lifter < LIFTERS; lifter++) {
    const trueE1rm = 60 + random.next() * 80;
    const weightKg = planned(trueE1rm);
    const sessions: Session[] = [];
    for (let n = 0; n < 12; n++) {
      // Six steady Sessions at the planned weight, then each Session costs a further rep of reserve.
      const fatigue = Math.max(0, n - 6 + 1) * CREEP_PER_SESSION;
      const performance = trueE1rm * (1 - fatigue) * (1 + random.normal(0, PERFORMANCE_SPREAD / 4));
      sessions.push(loggedSession(addDays('2026-10-05', n * 2), weightKg, performance));
    }
    // Creep starts with the Session at index 6; count the Sessions of creep up to the first flag.
    flaggedAfter.push((alarms(sessions, 7)[0] ?? Infinity) - 6 + 1);
  }
  const within = (sessionsOfCreep: number) => flaggedAfter.filter((n) => n <= sessionsOfCreep).length / LIFTERS;
  // There is no separate effort-creep rule: the creep shows as a falling RIR-adjusted e1RM. 93% are flagged
  // within 3 Sessions; the rest are lifters whose reserve started past the RIR 4 cap, or whose rounded
  // RIR repeated once, so the first creep Sessions looked level, and they are flagged one Session later.
  expect(within(3)).toBeGreaterThanOrEqual(0.9);
  expect(within(4)).toBe(1);
});

// The alarms an advice raises from Session `from` on: a run of consecutive Sessions flagged is one alarm.
function flagRuns(sessions: Session[], from: number, flagged: (history: TrainingHistory) => boolean): number {
  let runs = 0;
  let was = false;
  for (let n = from; n <= sessions.length; n++) {
    const now = flagged({ userId: 'sim', sessions: sessions.slice(0, n), weeklyTargets: [] });
    if (now && !was) runs++;
    was = now;
  }
  return runs;
}

// A flat lifter (true e1RM unchanged, RIR not trending) is Stalled, which is accommodation, and is rarely
// told they are Fatigued: over a Season (200 lifters, seed 207) every lifter is Stalled at some point (1.51
// Stall alarms each) and 50 of them also get a Fatigue alarm (0.275 alarms per lifter on average).
test('a flat lifter whose RIR does not move is Stalled, and gets at most 0.3 Fatigue alarms per Season on average', () => {
  const random = randomSource(207);
  let fatigue = 0;
  let stall = 0;
  let withFatigue = 0;
  let withStall = 0;
  for (let lifter = 0; lifter < LIFTERS; lifter++) {
    const trueE1rm = 60 + random.next() * 80;
    const weightKg = planned(trueE1rm);
    const sessions: Session[] = [];
    for (let week = 0; week < LEAD_IN_WEEKS + SEASON_WEEKS; week++) {
      for (const weekday of [0, 2, 4]) {
        sessions.push(loggedSession(addDays('2026-08-17', week * 7 + weekday), weightKg, trueE1rm * (1 + random.normal(0, PERFORMANCE_SPREAD))));
      }
    }
    const f = flagRuns(sessions, LEAD_IN_WEEKS * 3, (h) => recommendFatigue(h, 'bench-press', bench) !== undefined);
    const s = flagRuns(sessions, LEAD_IN_WEEKS * 3, (h) => recommendStall(h, 'bench-press', bench) !== undefined);
    fatigue += f;
    stall += s;
    if (f) withFatigue++;
    if (s) withStall++;
  }
  expect(withStall).toBe(LIFTERS);
  expect(fatigue / LIFTERS).toBeLessThanOrEqual(0.3);
});
