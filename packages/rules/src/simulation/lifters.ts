// A simulation of lifters over a Season, run through the real rules (deriveScoringEvents,
// seasonRankPoints, rankOf), to set the scoring constants (#31). Nothing here reimplements scoring:
// it only invents Sessions, and the rules say what they are worth.
//
// THE LIFTER MODEL: every number below is an assumption, listed so the owner can check it. The
// progress rates are rough rules of thumb, not measurements:
//   - Rates of strength gain fall steeply as a lifter gets stronger: novices add weight every
//     session or week (Rippetoe & Kilgore, Practical Programming for Strength Training, "novice",
//     "intermediate" and "advanced" stages), intermediates add a little every few weeks, and advanced
//     lifters work towards a few records a year (the same book; Kraemer & Ratamess 2004, ACSM
//     progression models: the rate of gain falls as trained status rises). The usual figures quoted
//     by coaches are about 5% a month for a novice, 1–2% a month for an intermediate and well under
//     0.5% a month for an advanced lifter, which is where SEASON_GAIN_BY_PERCENTILE comes from.
//   - A lifter's day-to-day performance on a lift varies by about 2% around their true e1RM
//     (the test-retest variation of repeated maximal efforts is of that order), which is what makes
//     a new best possible on any day, even with no true progress.

import { deriveScoringEvents, rankOf, seasonOf, seasonRankPoints, strengthLevelPercentile, weekStart, type Dated, type Rank, type Session, type Sex, type TrainingHistory } from '../index.ts';

// A seeded random source, so a simulation is the same every run.
export function randomSource(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (mean = 0, sd = 1) => mean + sd * Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
  return { next, normal };
}
type Random = ReturnType<typeof randomSource>;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// How far a lifter's true e1RM rises over a 13-week Season with full attendance, by their Strength
// Level percentile on the lift at the Season's start (interpolated between these points): about 5%
// a month for a true beginner, 2% a month for an intermediate, 0.5% a month for an advanced lifter.
const SEASON_GAIN_BY_PERCENTILE: [number, number][] = [
  [10, 0.2],
  [30, 0.12],
  [50, 0.06],
  [70, 0.035],
  [90, 0.015],
  [99, 0.006],
];
// Individual response (genetics, programme, sleep) multiplies the gain: log-normal, median 1.
const RESPONSE_SPREAD = 0.35;
// Day-to-day variation of performance around the true e1RM.
const PERFORMANCE_SPREAD = 0.02;

// The lifters: gym-goers, whose starting level on a lift is spread around the gym population's
// median (the standards are themselves gym percentiles), with each lift within about 7 percentiles
// of the lifter's overall level.
const LEVEL_MEAN = 50;
const LEVEL_SPREAD = 22;
const LIFT_SPREAD = 7;
// 55% men, and bodyweights around the standards' middle classes.
const MALE_SHARE = 0.55;
// Weekly Targets people set (spec: 2 to 6).
const TARGET_WEIGHTS: [number, number][] = [[2, 0.1], [3, 0.35], [4, 0.3], [5, 0.15], [6, 0.1]];
// Attendance: the chance each planned Session happens, per lifter, median 75%, and the chance a
// whole week is lost to illness, travel or holidays.
const ATTENDANCE_MEAN = 0.75;
const ATTENDANCE_SPREAD = 0.2;
const LOST_WEEK_CHANCE = 0.06;
// Progress follows training done: a week with fewer Sessions than this brings proportionally less.
const SESSIONS_FOR_FULL_PROGRESS = 3;
// Every Session trains three of the lifter's five lifts in rotation, three Working Sets each: four
// Benchmark Lifts and one accessory that is not (it is scored at the average of the Benchmark Lifts,
// spec: Strength Level). `share` sizes the accessory against the squat.
const LIFTS: { exercise: string; reps: number; share: number }[] = [
  { exercise: 'back-squat', reps: 5, share: 1 },
  { exercise: 'bench-press', reps: 5, share: 1 },
  { exercise: 'deadlift', reps: 5, share: 1 },
  { exercise: 'overhead-press', reps: 8, share: 1 },
  { exercise: 'leg-press', reps: 10, share: 1.5 },
];
const LIFTS_PER_SESSION = 3;
const SETS_PER_LIFT = 3;
const PLATE_KG = 2.5;
// Weeks trained before the Season, so the Calibration Sessions are behind the lifter.
const LEAD_IN_WEEKS = 8;
// Days of the week (0 = Monday) the Sessions fall on, by Weekly Target.
const TRAINING_DAYS: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };

export type Lifter = {
  sex: 'male' | 'female';
  bodyweightKg: number;
  weeklyTarget: number;
  attendance: number;
  response: number;
  lifts: { exercise: string; reps: number; e1rm: number; seasonGain: number }[];
};

export function drawLifter(random: Random): Lifter {
  const sex = random.next() < MALE_SHARE ? 'male' : 'female';
  const bodyweightKg = clamp(sex === 'male' ? random.normal(82, 12) : random.normal(66, 10), 48, 125);
  const level = random.normal(LEVEL_MEAN, LEVEL_SPREAD);
  let pick = random.next();
  const weeklyTarget = (TARGET_WEIGHTS.find(([, weight]) => (pick -= weight) < 0) ?? TARGET_WEIGHTS[0])[0];
  const lifts = LIFTS.map(({ exercise, reps, share }) => ({ exercise, reps, share, percentile: clamp(level + random.normal(0, LIFT_SPREAD), 3, 97) }));
  const squat = e1rmAtPercentile('back-squat', lifts[0].percentile, sex, bodyweightKg);
  return {
    sex,
    bodyweightKg,
    weeklyTarget,
    attendance: clamp(random.normal(ATTENDANCE_MEAN, ATTENDANCE_SPREAD), 0.2, 1),
    response: Math.exp(random.normal(0, RESPONSE_SPREAD)),
    lifts: lifts.map(({ exercise, reps, share, percentile }) => ({
      exercise,
      reps,
      // A Benchmark Lift starts at its percentile's e1RM; the accessory at a share of the squat's.
      e1rm: exercise === 'leg-press' ? squat * share : e1rmAtPercentile(exercise, percentile, sex, bodyweightKg),
      seasonGain: seasonGainAt(percentile),
    })),
  };
}

function seasonGainAt(percentile: number): number {
  const points = SEASON_GAIN_BY_PERCENTILE;
  if (percentile <= points[0][0]) return points[0][1];
  const above = points.findIndex(([p]) => p >= percentile);
  if (above === -1) return points[points.length - 1][1];
  const [[p0, g0], [p1, g1]] = [points[above - 1], points[above]];
  return g0 + ((g1 - g0) * (percentile - p0)) / (p1 - p0);
}

// The e1RM that sits at a percentile, by inverting the rules' own table lookup.
function e1rmAtPercentile(exercise: string, percentile: number, sex: Sex, bodyweightKg: number): number {
  let [low, high] = [0, 600];
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if ((strengthLevelPercentile(exercise, mid, sex, bodyweightKg) ?? 50) < percentile) low = mid;
    else high = mid;
  }
  return high;
}

function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

export type SeasonResult = { consistencyPoints: number; progressPoints: number; points: number; rank: Rank };

// A lifter's Season: LEAD_IN_WEEKS of training, then the Season's weeks, scored by the real rules
// from the Sessions alone. Season Rank Points start at 0 (a lifter's first Season).
export function simulateLifter(lifter: Lifter, random: Random, seasonDate = '2026-11-15'): SeasonResult {
  const season = seasonOf(seasonDate);
  const lastMonday = weekStart(season.end);
  const start = addDays(weekStart(season.start), -7 * LEAD_IN_WEEKS);
  const sessions: Session[] = [];
  const lifts = lifter.lifts.map((lift) => ({ ...lift }));
  let rotation = 0;
  for (let monday = start; monday <= lastMonday; monday = addDays(monday, 7)) {
    const lost = random.next() < LOST_WEEK_CHANCE;
    let done = 0;
    for (const day of TRAINING_DAYS[lifter.weeklyTarget]) {
      if (lost || random.next() >= lifter.attendance) continue;
      done++;
      const localDate = addDays(monday, day);
      const sets = [];
      for (let k = 0; k < LIFTS_PER_SESSION; k++) {
        const lift = lifts[rotation++ % lifts.length];
        const performance = lift.e1rm * (1 + random.normal(0, PERFORMANCE_SPREAD));
        const weightKg = Math.max(PLATE_KG, Math.floor(performance / (1 + lift.reps / 30) / PLATE_KG) * PLATE_KG);
        for (let s = 0; s < SETS_PER_LIFT; s++) sets.push({ id: `${localDate}-${lift.exercise}-${s}`, exercise: lift.exercise, custom: false, weightKg, reps: lift.reps });
      }
      sessions.push({ localDate, sets });
    }
    for (const lift of lifts) lift.e1rm *= 1 + (lift.seasonGain * lifter.response * Math.min(1, done / SESSIONS_FOR_FULL_PROGRESS)) / 13;
  }
  const events = deriveScoringEvents(history(lifter, sessions, start));
  const inSeason = (date: string) => date >= season.start && date <= season.end;
  let consistencyPoints = 0;
  let progressPoints = 0;
  for (const event of events) {
    if (event.kind === 'consistency' && inSeason(event.week)) consistencyPoints += event.consistencyPoints;
    if (event.kind === 'personal-record' && inSeason(event.localDate)) progressPoints += event.progressPoints;
  }
  const points = seasonRankPoints(0, events, season);
  return { consistencyPoints, progressPoints, points, rank: rankOf(points) };
}

function history(lifter: Lifter, sessions: Session[], effectiveFrom: string): TrainingHistory {
  const dated = <T>(value: T): Dated<T>[] => [{ effectiveFrom, value }];
  return {
    userId: 'sim',
    sessions,
    weeklyTargets: dated(lifter.weeklyTarget),
    profile: { sex: dated<Sex>(lifter.sex), bodyweightKg: dated(lifter.bodyweightKg) },
  };
}

// What a Season of showing up and nothing else earns: every week's Weekly Target met with Sessions
// at one unchanging weight, so there is never a Personal Record.
export function perfectConsistencyRank(weeklyTarget: number, season: { start: string; end: string }): Rank & { points: number } {
  const sessions: Session[] = [];
  for (let monday = weekStart(season.start); monday <= season.end; monday = addDays(monday, 7)) {
    for (const day of TRAINING_DAYS[weeklyTarget]) {
      const localDate = addDays(monday, day);
      sessions.push({ localDate, sets: Array.from({ length: 6 }, (_, i) => ({ id: `${localDate}-${i}`, exercise: 'back-squat', custom: false, weightKg: 100, reps: 5 })) });
    }
  }
  const events = deriveScoringEvents({ userId: 'perfect', sessions, weeklyTargets: [{ effectiveFrom: weekStart(season.start), value: weeklyTarget }] });
  const points = seasonRankPoints(0, events, { id: 'perfect', ...season });
  return { ...rankOf(points), points };
}

export type Population = {
  lifters: number;
  consistencyShare: number;
  medianConsistencyShare: number;
  tierShares: Record<string, number>;
};

export function simulatePopulation(seed: number, size: number): { results: SeasonResult[]; summary: Population } {
  const random = randomSource(seed);
  const results = Array.from({ length: size }, () => simulateLifter(drawLifter(random), random));
  const sum = (pick: (r: SeasonResult) => number) => results.reduce((total, r) => total + pick(r), 0);
  const shares = results.map((r) => r.consistencyPoints / r.points).sort((a, b) => a - b);
  const tierShares: Record<string, number> = {};
  for (const { rank } of results) tierShares[rank.tier] = (tierShares[rank.tier] ?? 0) + 1 / size;
  return {
    results,
    summary: {
      lifters: size,
      consistencyShare: sum((r) => r.consistencyPoints) / sum((r) => r.points),
      medianConsistencyShare: shares[Math.floor(size / 2)],
      tierShares,
    },
  };
}
