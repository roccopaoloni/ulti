// ULTI's rules: pure functions shared by the client and the server, with no I/O.

import { CEILINGS } from './ceilings.ts';
import { STANDARD_PERCENTILES, STRENGTH_STANDARDS, type StandardsRow } from './strength-standards.ts';

export type Set = {
  id: string;
  exercise: string;
  // A Custom Exercise: its Sets count toward a Session, but never earn Progress Points or get
  // recommendations.
  custom: boolean;
  // For a bodyweight Exercise, the weight added to the lifter's bodyweight (0 for none).
  weightKg: number;
  reps: number;
  // A bodyweight Exercise such as pull-ups or dips: its e1RM load is the lifter's average bodyweight plus weightKg.
  bodyweight?: boolean;
  // Reps in reserve, when the lifter logged it (spec: RIR), 0 to 4 where 4 means 4 or more.
  rir?: number;
  // The lifter's one-tap override of the detected label (spec: Warm-up detection).
  label?: SetLabel;
  // Where the lifter dragged the Set among its Exercise's Sets in the Session; none until they do.
  position?: number;
};

export type SetLabel = 'warm-up' | 'working';

export type Session = {
  localDate: string;
  sets: Set[];
  // A Deload Session: started while a Deload Week was on (ADR 0007). It needs fewer Working Sets to
  // qualify, and Calibration, go heavier and Stall ignore it.
  deload?: boolean;
};

export type TrainingHistory = {
  userId: string;
  sessions: Session[];
  // The dated Weekly Target history (ADR 0002).
  weeklyTargets: Dated<number>[];
  // Sex and bodyweight check-ins, dated (ADR 0002). Bodyweight Exercises are scored with the
  // average bodyweight; without them every other Personal Record is weighted as the 50th percentile.
  profile?: { sex: Dated<Sex>[]; bodyweightKg: Dated<number>[] };
  // The Mondays of the Deload Weeks the lifter accepted or started (spec: Deload Week). Only the
  // Deload Week advice reads them; how a Session counts is its own `deload` record.
  deloadWeeks?: string[];
};

// Bump when a change to the rules changes the events they derive, so stored events show which rules made them.
export const RULES_VERSION = 5;

// A lifter's first Sessions with an Exercise only set their starting best (spec: Calibration).
export const CALIBRATION_SESSIONS = 2;
// Sets of 1–12 reps are Personal Records by e1RM; above that e1RM overestimates, so Sets of more reps can only be rep PRs.
export const MAX_RECORD_REPS = 12;
// Progress Points per 1% of e1RM gained, before the Strength Level weight, and the most that any
// single Personal Record earns. Tuned with the simulation (#31): 22 sets a typical lifter's Progress to 40% of their Points; 150 is hit by a 7% gain at the 50th percentile.
export const POINTS_PER_PERCENT_GAIN = 22;
export const MAX_POINTS_PER_RECORD = 150;
// A lifter with no Strength Level to go on counts as the 50th percentile.
const DEFAULT_PERCENTILE = 50;
// Progress Points are multiplied by STRENGTH_WEIGHT_RANGE ^ ((percentile - 50) / WEIGHT_SPAN_PERCENTILES):
// 1 at the 50th percentile, 5 times as much 70 percentiles higher. That meets the design target
// that a 1% gain at the 90th percentile (advanced) equals a 5% gain at the 20th (beginner).
// The curve was kept at the simulation (#31): the ratio of those two weights is 5.00.
export const STRENGTH_WEIGHT_RANGE = 5;
export const WEIGHT_SPAN_PERCENTILES = 70;
// The Benchmark Lifts that are bodyweight Exercises: their tables hold the total load, but they are
// scored like any other Exercise (no Strength Level weighting, the 50th percentile).
const BODYWEIGHT_BENCHMARKS = new Set(['dip', 'chin-up', 'pull-up']);

// A new all-time best e1RM on a catalog Exercise (spec: Personal Record).
export type PersonalRecord = {
  kind: 'personal-record';
  id: string;
  exercise: string;
  setId: string;
  localDate: string;
  previousE1rm: number;
  newE1rm: number;
  percentGain: number;
  strengthLevelPercentile: number;
  // The average bodyweight used for a bodyweight Exercise, else the bodyweight in force on the day
  // (what weighted the points, for an audit); null when the lifter has none.
  bodyweightKg: number | null;
  rulesVersion: number;
  progressPoints: number;
  points: ModePoints;
};

// The Consistency Points a week of meeting the Weekly Target is worth, the same for everyone. 120
// splits evenly for every target from 2 to 6. Kept at 120 by the simulation (#31) with 22 Progress Points per 1%.
export const CONSISTENCY_WEEKLY_AMOUNT = 120;
// A qualifying Session has at least this many Working Sets (spec: Consistency Points).
export const QUALIFYING_WORKING_SETS = 6;
// ... or this many during a Deload Week, which has about half the Sets.
export const DELOAD_QUALIFYING_WORKING_SETS = 3;

// A week's Consistency Points (spec: Consistency Points): the share of the Weekly Target completed.
export type ConsistencyWeek = {
  kind: 'consistency';
  id: string;
  // The Monday that starts the week, as a local date.
  week: string;
  weeklyTarget: number;
  // The local dates of the qualifying Sessions that counted, at most the Weekly Target.
  sessionDates: string[];
  // The local dates of all the week's qualifying Sessions, beyond the Weekly Target too (Group
  // news lists who trained today). They earn no points.
  trainedDates: string[];
  rulesVersion: number;
  consistencyPoints: number;
  points: ModePoints;
};

// A Group's Scoring Mode (ADR 0001) re-scores the same events: Standard is Progress Points plus
// Consistency Points, PR Hunt only Progress Points, Grind only Consistency Points.
export const SCORING_MODES = ['standard', 'prHunt', 'grind'] as const;
export type ScoringMode = (typeof SCORING_MODES)[number];
// What an event is worth under each Scoring Mode, so every board is a plain sum.
export type ModePoints = Record<ScoringMode, number>;

const progressModePoints = (progressPoints: number): ModePoints => ({ standard: progressPoints, prHunt: progressPoints, grind: 0 });
const consistencyModePoints = (consistencyPoints: number): ModePoints => ({
  standard: consistencyPoints,
  prHunt: 0,
  grind: consistencyPoints,
});

// A Period's score: the sum of its events' points under a Scoring Mode (spec: Score a Period).
export function scorePeriod(events: readonly { points: ModePoints }[], mode: ScoringMode): number {
  return events.reduce((sum, event) => sum + event.points[mode], 0);
}

// Each kind of Scoring Event joins this union as its rules land.
export type ScoringEvent = PersonalRecord | ConsistencyWeek;

// The estimated one-rep max by the Epley formula, used everywhere (spec: e1RM).
export function e1rm(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

// Whether the Exercise's Sessions so far, the one in progress included, are all still setting the
// lifter's baseline: the app says so (spec: Calibration copy).
export function inCalibration(history: TrainingHistory, exercise: string): boolean {
  const sessions = regularSessions(history).filter((session) =>
    workingSets(session).some((set) => set.exercise === exercise && !set.custom),
  );
  return sessions.length <= CALIBRATION_SESSIONS;
}

// The percentile of an e1RM on a Benchmark Lift for the lifter's sex and bodyweight, or undefined
// for any other Exercise (spec: Strength Level). The weight class is the lightest one that holds the
// bodyweight, else the nearest the lift has. "Prefer not to say" uses the midpoint of the male and
// female standards. Between the table's percentiles the e1RM is interpolated, from 0 at no weight.
export function strengthLevelPercentile(exercise: string, e1rmKg: number, sex: Sex, bodyweightKg: number): number | undefined {
  const standards = STRENGTH_STANDARDS[exercise];
  if (!standards) return undefined;
  const classFor = (rows: StandardsRow[]) => (rows.find((row) => bodyweightKg <= row.upToKg) ?? rows[rows.length - 1]!).kg;
  const kg =
    sex === 'unspecified'
      ? classFor(standards.male).map((value, i) => (value + classFor(standards.female)[i]!) / 2)
      : classFor(standards[sex]);
  const points = [0, ...STANDARD_PERCENTILES];
  const values = [0, ...kg];
  const above = values.findIndex((value) => value >= e1rmKg);
  if (above === -1) return 99;
  if (above === 0) return 0;
  const [lo, hi] = [values[above - 1]!, values[above]!];
  const [pLo, pHi] = [points[above - 1]!, points[above]!];
  return pLo + ((pHi - pLo) * (e1rmKg - lo)) / (hi - lo);
}

export { CEILINGS } from './ceilings.ts';

// Whether a Set is beyond any human (spec: Implausible Sets): its e1RM is over its catalog
// Exercise's ceiling, whatever its label. A bodyweight Exercise is lifted at the lifter's bodyweight
// plus the added weight, or the added weight alone when no bodyweight is logged. A Custom Exercise
// has no ceiling, so it is never implausible.
export function isImplausibleSet(set: Pick<Set, 'exercise' | 'custom' | 'weightKg' | 'reps' | 'bodyweight'>, bodyweightKg?: number): boolean {
  if (set.custom) return false;
  const ceiling = CEILINGS[set.exercise];
  if (!ceiling) return false;
  return e1rm(set.weightKg + (set.bodyweight ? (bodyweightKg ?? 0) : 0), set.reps) > ceiling.kg;
}

// The history without its Implausible Sets: the server scores one that reaches it as if it weren't there.
function withoutImplausibleSets(history: TrainingHistory): TrainingHistory {
  const weights = history.profile?.bodyweightKg ?? [];
  return {
    ...history,
    sessions: history.sessions.map((session) => {
      const bodyweightKg = session.sets.some((set) => set.bodyweight) ? averageBodyweight(weights, session.localDate) : undefined;
      return { ...session, sets: session.sets.filter((set) => !isImplausibleSet(set, bodyweightKg)) };
    }),
  };
}

export function deriveScoringEvents(history: TrainingHistory): ScoringEvent[] {
  history = withoutImplausibleSets(history);
  return [...derivePersonalRecords(history), ...deriveConsistency(history)];
}

// The percentile that weights a Personal Record on an Exercise, and sets the limit of a jump. A
// Benchmark Lift is measured by its own e1RM; any other Exercise by the average of the lifter's
// levels on the Benchmark Lifts they do, each at their best e1RM so far (`bests`). Without a
// bodyweight, or on a bodyweight Benchmark Lift, it is the 50th percentile.
function weightingPercentile(
  exercise: string,
  levelE1rm: number | undefined,
  bests: ReadonlyMap<string, number>,
  sex: Sex,
  bodyweightKg: number | null,
): number {
  if (bodyweightKg === null || BODYWEIGHT_BENCHMARKS.has(exercise)) return DEFAULT_PERCENTILE;
  const own = levelE1rm === undefined ? undefined : strengthLevelPercentile(exercise, levelE1rm, sex, bodyweightKg);
  const levels = [...bests]
    .filter(([lift]) => !BODYWEIGHT_BENCHMARKS.has(lift))
    .flatMap(([lift, liftBest]) => strengthLevelPercentile(lift, liftBest, sex, bodyweightKg) ?? []);
  return own ?? (levels.length === 0 ? DEFAULT_PERCENTILE : levels.reduce((a, b) => a + b, 0) / levels.length);
}

// A jump is a Set more than this far over the lifter's baseline within 28 days (spec: Implausible
// Sets), by the baseline's percentile: +40% below the 25th, +20% up to the 75th, +10% above it.
const JUMP_WINDOW_DAYS = 28;
function jumpLimit(percentile: number): number {
  return percentile < 25 ? 0.4 : percentile <= 75 ? 0.2 : 0.1;
}

// The Sets that are a jump (spec: Implausible Sets), by ID, with the percent each is over its
// baseline (rounded to 0.01). Only Sets that could be a Personal Record are checked: a catalog
// Exercise's Working Sets of 1–12 reps, past Calibration, outside Deload Sessions. The baseline is
// the lifter's best e1RM going into the 28 days up to the Set's local date, or their Calibration
// best if their first Session on the Exercise is newer than that; a jump saved in those days
// replaces it. A jump counts as the best from then on (as Calibration sets the starting best), which
// is why an honest returning lifter is flagged once. The history holds the Set being checked.
export function findJumps(history: TrainingHistory): Map<string, number> {
  history = withoutImplausibleSets(history);
  const jumps = new Map<string, number>();
  const bests = new Map<string, number>();
  const done = new Map<string, { localDate: string; best: number }[]>();
  const saved = new Map<string, { localDate: string; value: number }[]>();
  for (const session of regularSessions(history)) {
    const working = workingSets(session).filter((set) => !set.custom);
    for (const exercise of new Set(working.map((set) => set.exercise))) {
      const earlier = done.get(exercise) ?? [];
      const sets = working.filter((s) => s.exercise === exercise);
      const averageKg = sets[0].bodyweight ? averageBodyweight(history.profile?.bodyweightKg ?? [], session.localDate) : null;
      if (averageKg === undefined) {
        done.set(exercise, [...earlier, { localDate: session.localDate, best: 0 }]);
        continue;
      }
      const sex = valueInForce(history.profile?.sex ?? [], session.localDate) ?? 'unspecified';
      const bodyweightKg = averageKg ?? valueInForce(history.profile?.bodyweightKg ?? [], session.localDate) ?? null;
      const windowStart = new Date(Date.parse(`${session.localDate}T00:00:00Z`) - JUMP_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
      const before = earlier.filter((entry) => entry.localDate < windowStart);
      const bestOf = (entries: { best: number }[]) => Math.max(0, ...entries.map((entry) => entry.best));
      const calibrating = earlier.length < CALIBRATION_SESSIONS;
      let sessionBest = 0;
      for (const set of sets.filter((s) => s.reps <= MAX_RECORD_REPS)) {
        const value = e1rm(set.weightKg + (averageKg ?? 0), set.reps);
        sessionBest = Math.max(sessionBest, value);
        if (calibrating) continue;
        const baseline = Math.max(
          before.length > 0 ? bestOf(before) : bestOf(earlier.slice(0, CALIBRATION_SESSIONS)),
          ...(saved.get(exercise) ?? []).filter((jump) => jump.localDate >= windowStart).map((jump) => jump.value),
        );
        if (baseline === 0) continue;
        const limit = jumpLimit(weightingPercentile(exercise, baseline, bests, sex, bodyweightKg));
        if (value > baseline * (1 + limit) + 1e-9) {
          jumps.set(set.id, Math.round((value / baseline - 1) * 10000) / 100);
          saved.set(exercise, [...(saved.get(exercise) ?? []), { localDate: session.localDate, value }]);
        }
      }
      done.set(exercise, [...earlier, { localDate: session.localDate, best: sessionBest }]);
      bests.set(exercise, Math.max(bests.get(exercise) ?? 0, sessionBest));
    }
  }
  return jumps;
}

function derivePersonalRecords(history: TrainingHistory): PersonalRecord[] {
  const jumps = findJumps(history);
  const events: PersonalRecord[] = [];
  const bests = new Map<string, number>();
  // The earlier Sets of more than 12 reps per Exercise: the load they were lifted at and their reps.
  const repSets = new Map<string, { load: number; reps: number }[]>();
  const sessionsDone = new Map<string, number>();
  for (const session of regularSessions(history)) {
    // Only Working Sets reach scoring (spec: Warm-up detection), and Custom Exercises never score.
    const working = workingSets(session).filter((set) => !set.custom);
    for (const exercise of new Set(working.map((set) => set.exercise))) {
      const calibrating = (sessionsDone.get(exercise) ?? 0) < CALIBRATION_SESSIONS;
      sessionsDone.set(exercise, (sessionsDone.get(exercise) ?? 0) + 1);
      // At most one Personal Record of each kind per Exercise per Session, for its best eligible
      // Set, so a jump split across Sets can't dodge the per-record cap.
      const sets = working.filter((s) => s.exercise === exercise);
      // A bodyweight Exercise is lifted at the lifter's recent average bodyweight plus the added
      // weight, so a short swing can't create or erase a record. Without a check-in it can't be scored.
      const averageKg = sets[0].bodyweight ? averageBodyweight(history.profile?.bodyweightKg ?? [], session.localDate) : null;
      if (averageKg === undefined) continue;
      const load = (s: Set) => s.weightKg + (averageKg ?? 0);
      const sex = valueInForce(history.profile?.sex ?? [], session.localDate) ?? 'unspecified';
      const bodyweightKg = averageKg ?? valueInForce(history.profile?.bodyweightKg ?? [], session.localDate) ?? null;
      const record = (set: Set, value: number, previous: number, levelE1rm: number | undefined) => {
        const gain = (value / previous - 1) * 100;
        const percentile = weightingPercentile(exercise, levelE1rm, bests, sex, bodyweightKg);
        const weight = STRENGTH_WEIGHT_RANGE ** ((percentile - 50) / WEIGHT_SPAN_PERCENTILES);
        const progressPoints = Math.min(MAX_POINTS_PER_RECORD, Math.round(gain * POINTS_PER_PERCENT_GAIN * weight));
        events.push({
          kind: 'personal-record',
          id: `${history.userId}:personal-record:${set.id}`,
          exercise,
          setId: set.id,
          localDate: session.localDate,
          previousE1rm: previous,
          newE1rm: value,
          percentGain: Math.round(gain * 100) / 100,
          strengthLevelPercentile: Math.round(percentile * 100) / 100,
          bodyweightKg,
          rulesVersion: RULES_VERSION,
          progressPoints,
          points: progressModePoints(progressPoints),
        });
      };
      // A jump earns nothing but becomes the best, like Calibration, even before the Session's other Sets.
      const jumped = Math.max(0, ...sets.filter((s) => jumps.has(s.id)).map((s) => e1rm(load(s), s.reps)));
      if (jumped > (bests.get(exercise) ?? 0)) bests.set(exercise, jumped);
      const best = bests.get(exercise) ?? 0;

      // Sets of 1–12 reps: a new all-time best e1RM.
      const eligible = sets.filter((s) => s.reps <= MAX_RECORD_REPS && !jumps.has(s.id));
      if (eligible.length > 0) {
        const set = eligible.reduce((top, s) => (e1rm(load(s), s.reps) > e1rm(load(top), top.reps) ? s : top));
        const value = e1rm(load(set), set.reps);
        if (value > best) {
          bests.set(exercise, value);
          if (!calibrating && best !== 0) record(set, value, best, value);
        }
      }

      // Sets of more than 12 reps are rep PRs: as heavy as any earlier such Set, and more reps than
      // any earlier one at that weight or heavier. They earn by e1RM gain over the earlier high-rep
      // best but never touch the 1–12 rep best.
      const earlier = repSets.get(exercise) ?? [];
      const high = sets.filter((s) => s.reps > MAX_RECORD_REPS);
      const earlierBest = Math.max(0, ...earlier.map((e) => e1rm(e.load, e.reps)));
      const heaviest = Math.max(0, ...earlier.map((e) => e.load));
      const beats = high.filter((s) => {
        const reps = Math.max(0, ...earlier.filter((e) => e.load >= load(s)).map((e) => e.reps));
        return earlier.length > 0 && load(s) >= heaviest && s.reps > reps && e1rm(load(s), s.reps) > earlierBest;
      });
      if (beats.length > 0 && !calibrating) {
        const set = beats.reduce((top, s) => (e1rm(load(s), s.reps) > e1rm(load(top), top.reps) ? s : top));
        record(set, e1rm(load(set), set.reps), earlierBest, bests.get(exercise));
      }
      repSets.set(exercise, [...earlier, ...high.map((s) => ({ load: load(s), reps: s.reps }))]);
    }
  }
  return events;
}

// Only Working Sets reach scoring (spec: Warm-up detection).
function qualifyingSessions(history: TrainingHistory): Session[] {
  return history.sessions.filter(
    (session) => workingSets(session).length >= (session.deload ? DELOAD_QUALIFYING_WORKING_SETS : QUALIFYING_WORKING_SETS),
  );
}

// The Consistency Points each of the history's Sessions added, in the same order: its share of the
// weekly amount if it is one of the first Weekly Target qualifying Sessions of its week, else 0.
export function sessionConsistencyPoints(history: TrainingHistory): number[] {
  const qualifying = new Set(qualifyingSessions(history));
  const counted = new Map<string, number>();
  return history.sessions.map((session) => {
    if (!qualifying.has(session)) return 0;
    const week = weekStart(session.localDate);
    const weeklyTarget = weeklyTargetOf(history.weeklyTargets, week);
    const before = counted.get(week) ?? 0;
    counted.set(week, before + 1);
    return weeklyTarget !== undefined && before < weeklyTarget ? CONSISTENCY_WEEKLY_AMOUNT / weeklyTarget : 0;
  });
}

function deriveConsistency(history: TrainingHistory): ConsistencyWeek[] {
  const qualifying = qualifyingSessions(history);
  const events: ConsistencyWeek[] = [];
  for (const week of [...new Set(qualifying.map((session) => weekStart(session.localDate)))].sort()) {
    const weeklyTarget = weeklyTargetOf(history.weeklyTargets, week);
    if (weeklyTarget === undefined) continue;
    const trainedDates = qualifying.filter((session) => weekStart(session.localDate) === week).map((session) => session.localDate);
    const sessionDates = trainedDates.slice(0, weeklyTarget);
    const consistencyPoints = (CONSISTENCY_WEEKLY_AMOUNT * sessionDates.length) / weeklyTarget;
    events.push({
      kind: 'consistency',
      id: `${history.userId}:consistency:${week}`,
      week,
      weeklyTarget,
      sessionDates,
      trainedDates,
      rulesVersion: RULES_VERSION,
      consistencyPoints,
      points: consistencyModePoints(consistencyPoints),
    });
  }
  return events;
}

// The Sessions that are not Deload Sessions: the only ones Calibration, Personal Records, go heavier and
// Stall look at (spec: Deload Week).
function regularSessions(history: TrainingHistory): Session[] {
  return history.sessions.filter((session) => !session.deload);
}

// The Weekly Target a week (given by its Monday) is scored with. A change applies from the next
// Monday, so the target in force is the one on the week's Monday; the very first target also covers
// the week it was set in.
export function weeklyTargetOf(weeklyTargets: Dated<number>[], week: string): number | undefined {
  return valueInForce(weeklyTargets, week) ?? valueInForce(weeklyTargets, weekEnd(week));
}

// The weeks (as their Mondays) in which the Weekly Target was met, Deload Weeks included (spec: Week Stamps).
export function weekStamps(events: ConsistencyWeek[]): string[] {
  return events.filter((event) => event.sessionDates.length === event.weeklyTarget).map((event) => event.week);
}

// The number of consecutive Week Stamps up to the last finished week, plus this week's once it has
// its own: the week still running neither breaks the Streak nor extends it before then.
export function streak(events: ConsistencyWeek[], today: string): number {
  const stamped = new Set(weekStamps(events));
  let week = weekStart(today);
  let count = stamped.has(week) ? 1 : 0;
  for (week = previousMonday(week); stamped.has(week); week = previousMonday(week)) count++;
  return count;
}

function previousMonday(week: string): string {
  const day = new Date(`${week}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 7);
  return day.toISOString().slice(0, 10);
}

// The Monday of the local date's week (weeks run Monday to Sunday).
export function weekStart(localDate: string): string {
  const day = new Date(`${localDate}T00:00:00Z`);
  // getUTCDay: Sunday is 0, Monday is 1.
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() || 7) - 1));
  return day.toISOString().slice(0, 10);
}

// The Sunday that ends the week starting on the given Monday.
function weekEnd(week: string): string {
  const day = new Date(`${week}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 6);
  return day.toISOString().slice(0, 10);
}

// One week of the History screen: its Sessions (as given, newest first) against the Weekly Target,
// whether it earned its Week Stamp, and its points (Consistency Points plus Progress Points).
export type HistoryWeek<S> = {
  // The Monday and the Sunday of the week, as local dates.
  week: string;
  end: string;
  sessions: S[];
  done: number;
  target: number;
  stamped: boolean;
  points: number;
};

// The weeks from `today`'s back to the oldest Session's, newest first, empty ones between included.
export function historyWeeks<S extends { localDate: string }>(input: {
  sessions: readonly S[];
  consistency: readonly ConsistencyWeek[];
  records: readonly Pick<PersonalRecord, 'localDate' | 'progressPoints'>[];
  weeklyTargets: Dated<number>[];
  today: string;
}): HistoryWeek<S>[] {
  const current = weekStart(input.today);
  const oldest = input.sessions.reduce((min, { localDate }) => (localDate < min ? localDate : min), input.today);
  const first = weekStart(oldest);
  const weeks: HistoryWeek<S>[] = [];
  for (let week = current; week >= first; week = previousMonday(week)) {
    const end = weekEnd(week);
    const scored = input.consistency.find((event) => event.week === week);
    const done = scored?.sessionDates.length ?? 0;
    const target = scored?.weeklyTarget ?? weeklyTargetOf(input.weeklyTargets, week) ?? 0;
    const progress = input.records
      .filter(({ localDate }) => localDate >= week && localDate <= end)
      .reduce((sum, record) => sum + record.progressPoints, 0);
    weeks.push({
      week,
      end,
      sessions: input.sessions.filter(({ localDate }) => localDate >= week && localDate <= end),
      done,
      target,
      stamped: scored !== undefined && done === target,
      points: (scored?.consistencyPoints ?? 0) + progress,
    });
  }
  return weeks;
}

// Puts a Session's Sets, given in the order they were logged, in the order they are done. Each
// Exercise's Sets go by position, then logged order: a Set with no position (logged before any
// drag, or after it) comes after the positioned ones. The Exercises keep the places they had.
export function orderSets<T extends { exercise: string; position?: number }>(sets: readonly T[]): T[] {
  const byExercise = new Map<string, T[]>();
  for (const set of sets) byExercise.set(set.exercise, [...(byExercise.get(set.exercise) ?? []), set]);
  // Array.sort is stable, so Sets with the same position (or none) stay in logged order.
  const queues = new Map([...byExercise].map(([exercise, own]) => [exercise, own.sort((a, b) => (a.position ?? Number.MAX_VALUE) - (b.position ?? Number.MAX_VALUE))]));
  return sets.map((set) => queues.get(set.exercise)!.shift()!);
}

// What dragging a Set to `toIndex` among its Exercise's Sets (given in their order) does: the new
// order, and whether the Set becomes a Warm-up Set of the lifter's own, which it does when it lands
// in front of a Warm-up Set, detected or by hand. Any other move leaves labels as they are.
export function moveSet(sets: readonly { id: string; weightKg: number; label?: SetLabel }[], setId: string, toIndex: number): { ids: string[]; warmUp: boolean } {
  const labels = labelSets([...sets]);
  const moved = sets.findIndex((set) => set.id === setId);
  const ids = sets.map((set) => set.id);
  ids.splice(moved, 1);
  ids.splice(toIndex, 0, setId);
  const after = new Set(ids.slice(toIndex + 1));
  return { ids, warmUp: sets.some((set, index) => after.has(set.id) && labels[index] === 'warm-up') };
}

// Labels one Exercise's Sets of one Session, in the order they were logged: a Set is a Warm-up Set
// when it comes before the first Set within 10% of the heaviest weight, so back-off Sets after the
// top Set stay Working Sets. A lifter's override wins over the detected label.
export function labelSets(sets: { weightKg: number; label?: SetLabel }[]): SetLabel[] {
  const heaviest = Math.max(...sets.map((set) => set.weightKg));
  const firstWorking = sets.findIndex((set) => set.weightKg >= heaviest * 0.9);
  return sets.map((set, index) => set.label ?? (index < firstWorking ? 'warm-up' : 'working'));
}

// The labels rows not logged yet would get, were they logged after the Sets already logged: each row
// is labelled against the whole plan, so a light first row of a ramp shows Warm-up before it is
// logged. A row with a label of its own (the lifter's tap) keeps it.
export function predictLabels(logged: { weightKg: number; label?: SetLabel }[], rows: { weightKg: number; label?: SetLabel }[]): SetLabel[] {
  return labelSets([...logged, ...rows]).slice(logged.length);
}

// Whether to ask for RIR after the logged Set: never after a Warm-up Set, and not for the rest of
// the Session once the lifter skipped it on the Session's first Working Set (design: Logging a Session).
// The Sets are the whole Session's, in the order they were logged.
export function asksRir(sets: { id: string; exercise: string; weightKg: number; label?: SetLabel; rir?: number }[], setId: string): boolean {
  const labelOf = new Map<string, SetLabel>();
  for (const exercise of new Map(sets.map((set) => [set.exercise, 0])).keys()) {
    const own = sets.filter((set) => set.exercise === exercise);
    labelSets(own).forEach((label, index) => labelOf.set(own[index]!.id, label));
  }
  const first = sets.find((set) => labelOf.get(set.id) === 'working');
  return labelOf.get(setId) === 'working' && (first?.id === setId || first?.rir !== undefined);
}

// The Session's Working Sets, in the order they were logged.
export function workingSets(session: Session): Set[] {
  const labels = new Map<string, SetLabel[]>();
  for (const exercise of new Map(session.sets.map((set) => [set.exercise, 0])).keys()) {
    labels.set(exercise, labelSets(session.sets.filter((set) => set.exercise === exercise)));
  }
  return session.sets.filter((set) => labels.get(set.exercise)!.shift() === 'working');
}

// What the logging keypad's + (direction 1) and − (direction -1) do to a weight or a rep count:
// step by the Exercise's Increment (reps use 1), never below zero.
export function stepValue(current: number, increment: number, direction: 1 | -1): number {
  return Math.max(0, Math.round((current + direction * increment) * 1000) / 1000);
}

// A dated history (ADR 0002): each entry holds from its local date (YYYY-MM-DD) until the next one
// starts, so a past date is always scored with the value that was in force then.
export type Dated<T> = { effectiveFrom: string; value: T };

export function valueInForce<T>(history: readonly Dated<T>[], localDate: string): T | undefined {
  // ISO dates compare correctly as strings.
  return history
    .filter(({ effectiveFrom }) => effectiveFrom <= localDate)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]?.value;
}

// The days of bodyweight that make up a bodyweight Exercise's load.
const BODYWEIGHT_AVERAGE_DAYS = 28;

// The lifter's average bodyweight over the four weeks up to and including a local date: the check-in
// in force on each day of them (ADR 0002). Undefined before their first check-in.
function averageBodyweight(history: readonly Dated<number>[], localDate: string): number | undefined {
  const end = Date.parse(`${localDate}T00:00:00Z`);
  const known: number[] = [];
  for (let back = 0; back < BODYWEIGHT_AVERAGE_DAYS; back++) {
    const value = valueInForce(history, new Date(end - back * 86_400_000).toISOString().slice(0, 10));
    if (value !== undefined) known.push(value);
  }
  return known.length === 0 ? undefined : known.reduce((sum, value) => sum + value, 0) / known.length;
}

// The Monday after a local date: a Weekly Target changed on any day applies from then, so nobody
// can lower it on a Saturday to look consistent (weeks run Monday to Sunday).
export function nextMonday(localDate: string): string {
  const day = new Date(`${localDate}T00:00:00Z`);
  // getUTCDay: Sunday is 0, Monday is 1.
  day.setUTCDate(day.getUTCDate() + (8 - (day.getUTCDay() || 7)));
  return day.toISOString().slice(0, 10);
}

// The dated histories a user keeps (ADR 0002). Sex and bodyweight never leave the user's own
// account; they only weight Progress Points.
export type ProfileField = 'sex' | 'bodyweightKg' | 'weeklyTarget';
export type Sex = 'male' | 'female' | 'unspecified';

// Whether a value is one the field can hold. The server rejects any other.
export function isProfileValue(field: string, value: unknown): boolean {
  switch (field) {
    case 'sex':
      return value === 'male' || value === 'female' || value === 'unspecified';
    case 'bodyweightKg':
      return typeof value === 'number' && value >= 20 && value <= 500;
    case 'weeklyTarget':
      return Number.isInteger(value) && (value as number) >= 2 && (value as number) <= 6;
    default:
      return false;
  }
}

// The muscle groups an Exercise is filed under, one main muscle each (spec: Catalog seed), in the
// order the picker lists them.
export const muscles = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full-body'] as const;
export type Muscle = (typeof muscles)[number];

export function isMuscle(value: unknown): value is Muscle {
  return muscles.includes(value as Muscle);
}

// The kind of movement a catalog Exercise trains (spec: Movement Pattern). A Custom Exercise has
// none and counts as isolation.
export const movementPatterns = ['squat', 'hinge', 'horizontal-press', 'vertical-press', 'horizontal-pull', 'vertical-pull', 'isolation'] as const;
export type MovementPattern = (typeof movementPatterns)[number];

export function isMovementPattern(value: unknown): value is MovementPattern {
  return movementPatterns.includes(value as MovementPattern);
}

// Compound is any pattern but isolation; an Exercise with no pattern is isolation.
export function isCompound(pattern: MovementPattern | null | undefined): boolean {
  return pattern !== null && pattern !== undefined && pattern !== 'isolation';
}

// Whether an Exercise's text (its name and equipment) answers a search: case and accents don't
// matter, and every word typed has to be in it.
export function matchesSearch(text: string, query: string): boolean {
  const plain = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const haystack = plain(text);
  return plain(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

// The app asks for bodyweight every two weeks. A dismissed prompt counts as asking, and the last
// value carries forward.
export function bodyweightPromptDue(lastAskedOn: string, today: string): boolean {
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastAskedOn}T00:00:00Z`)) / 86_400_000;
  return days >= 14;
}

// Weights are stored in kg and converted for display.
export type Units = 'kg' | 'lb';
const kgPerLb = 0.45359237;
export const kgToUnits = (kg: number, units: Units) => (units === 'kg' ? kg : kg / kgPerLb);
export const unitsToKg = (weight: number, units: Units) => (units === 'kg' ? weight : weight * kgPerLb);

// The Increment shown in the user's units. In lb it is the nearest 2.5 lb (a plate pair), never less.
export const incrementInUnits = (incrementKg: number, units: Units) =>
  units === 'kg' ? incrementKg : Math.max(2.5, Math.round(kgToUnits(incrementKg, units) / 2.5) * 2.5);

// A Routine: its Sessions (Routine Days), each listing Exercises with a number of Sets and a Rep Range.
// `rangeSince` is the local date a Stall's Switch moved the Rep Range, if one did.
export type RoutineExercise = { exerciseId: string; sets: number; repMin: number; repMax: number; rangeSince?: string };
// `colour` is the Day's slot in the accent rotation. It is stored on the Day so it stays with the
// Day when Days are reordered and syncs with the Routine; Routines saved before it lack it.
export type RoutineDay = { id: string; name: string; colour?: number; exercises: RoutineExercise[] };

// How many accents the rotation has (pink, cyan, lime, coral, violet).
export const DAY_COLOURS = 5;

// The accent slot (0 to 4) of the Day at `index`: the Day's own, else the one its position gives.
// History uses this too, to dot a Session with the colour of the Day it was started from.
export function dayColour(days: readonly RoutineDay[], index: number): number {
  return days[index].colour ?? index % DAY_COLOURS;
}

// The same Days, each carrying its colour, so a reorder cannot change what position gave it.
export function withDayColours(days: readonly RoutineDay[]): RoutineDay[] {
  return days.map((day, index) => ({ ...day, colour: dayColour(days, index) }));
}

// The colour for a Day added to these: the first no Day has, else the rotation starts over.
export function nextDayColour(days: readonly RoutineDay[]): number {
  const taken = new Set(days.map((_, index) => dayColour(days, index)));
  for (let colour = 0; colour < DAY_COLOURS; colour++) if (!taken.has(colour)) return colour;
  return days.length % DAY_COLOURS;
}

// The list with the item at `from` moved to place `to` (the end, if past it), as when a Routine Day
// or Exercise is dragged to a new place.
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const moved = [...list];
  const [item] = moved.splice(from, 1);
  moved.splice(Math.max(0, Math.min(to, moved.length)), 0, item);
  return moved;
}

// A Routine being edited is whole when every Day is named and holds Exercises, each picked, with
// Sets and a Rep Range that make sense. Only then is it the Routine; null until then.
export function completeRoutine(draft: readonly RoutineDay[]): RoutineDay[] | null {
  if (draft.length === 0) return null;
  const whole = (n: number) => Number.isInteger(n) && n >= 1;
  for (const day of draft) {
    if (day.name.trim() === '' || day.exercises.length === 0) return null;
    for (const { exerciseId, sets, repMin, repMax } of day.exercises) {
      if (!exerciseId || !whole(sets) || !whole(repMin) || !whole(repMax) || repMin > repMax) return null;
    }
  }
  return draft.map((day) => ({ ...day, name: day.name.trim() }));
}

// The Weekly Target a Routine suggests: one Session a week per Routine Day, within the 2–6 a
// Weekly Target can be.
export function suggestedWeeklyTarget(routineDays: number): number {
  return Math.min(6, Math.max(2, routineDays));
}

// The Suggested Day: the Routine Day done longest ago, offered first when starting a Session. A Day
// never done counts as the oldest, and ties go to Routine order. `done` is every Session started
// from a Routine Day; those from a Day no longer in the Routine are ignored.
export function suggestedRoutineDay(dayIds: readonly string[], done: readonly { dayId: string; startedAt: string }[]): string {
  const latest = new Map<string, string>();
  for (const { dayId, startedAt } of done) {
    if ((latest.get(dayId) ?? '') < startedAt) latest.set(dayId, startedAt);
  }
  let oldest = dayIds[0];
  for (const id of dayIds) if ((latest.get(id) ?? '') < (latest.get(oldest) ?? '')) oldest = id;
  return oldest;
}

export type RoutineDayChoice = { day: RoutineDay; colour: number; exerciseCount: number; lastDone: string | null; suggested: boolean };

// The Days to pick from when starting a Session: the Suggested Day first, then the rest in Routine
// order. `lastDone` is the local date of the latest Session started from the Day (the same Sessions
// the suggestion counts), null if never.
export function routineDayChoices(days: readonly RoutineDay[], done: readonly { dayId: string; startedAt: string; localDate: string }[]): RoutineDayChoice[] {
  const suggested = days.length ? suggestedRoutineDay(days.map((day) => day.id), done) : undefined;
  const choices = days.map((day, index): RoutineDayChoice => {
    const latest = done.filter((session) => session.dayId === day.id).reduce<(typeof done)[number] | undefined>((a, b) => (!a || a.startedAt < b.startedAt ? b : a), undefined);
    return { day, colour: dayColour(days, index), exerciseCount: day.exercises.length, lastDone: latest?.localDate ?? null, suggested: day.id === suggested };
  });
  return [...choices.filter((choice) => choice.suggested), ...choices.filter((choice) => !choice.suggested)];
}

// The rows of an Exercise's Sets still to do when a Session starts: the last Session's Sets, with
// the Routine Day's planned Sets filling any rows past them by repeating the last one (an empty
// row when there was no earlier Session). If the last Session had more Sets than planned, all stay.
export function plannedRows<T>(lastSets: readonly T[], plannedSets: number | undefined): (T | undefined)[] {
  const rows: (T | undefined)[] = [...lastSets];
  while (rows.length < (plannedSets ?? 0)) rows.push(lastSets.at(-1));
  return rows;
}

// The last Session's Sets with a recommendation (go heavier or Stall) applied: only the Working Sets
// take its weight and reps, the Warm-up Sets keeping the last Session's numbers.
export function rowsWithAdvice<T extends { weightKg: number; reps: number; label?: SetLabel }>(lastSets: readonly T[], advice: { weightKg: number; reps: number }): (T | { weightKg: number; reps: number })[] {
  const labels = labelSets(lastSets.map(({ weightKg, label }) => ({ weightKg, label })));
  return lastSets.map((set, index) => (labels[index] === 'warm-up' ? set : { weightKg: advice.weightKg, reps: advice.reps }));
}

export * from './rank.ts';
export * from './routine-link.ts';

// What an Exercise is trained to in a Routine, and the Increment that applies to it.
// `since` is when the Rep Range was last switched by a Stall: only Sessions from then on can fail it.
export type GoHeavierRule = { repMin: number; repMax: number; incrementKg: number; since?: string };
export type GoHeavier = { weightKg: number; reps: number; incrementKg: number };

// Double progression (spec: Go heavier): once every Working Set of the Exercise's last Session
// reached the top of its Rep Range, the next Session is the Increment heavier with reps back at the
// bottom of the range.
export function recommendGoHeavier(history: TrainingHistory, exercise: string, rule: GoHeavierRule): GoHeavier | undefined {
  const sessions = regularSessions(history)
    .map((session) => workingSets(session).filter((set) => set.exercise === exercise && !set.custom))
    .filter((working) => working.length > 0);
  const reachedTop = (working: Set[] | undefined) => !!working && working.every((set) => set.reps >= rule.repMax);
  const working = sessions.at(-1);
  if (!working || !reachedTop(working)) return undefined;
  // A Set taken to RIR 0 means the lifter is still grinding: wait for one more qualifying Session.
  if (working.some((set) => set.rir === 0) && !reachedTop(sessions.at(-2))) return undefined;
  const weightKg = Math.max(...working.map((set) => set.weightKg));
  return { weightKg: weightKg + rule.incrementKg, reps: rule.repMin, incrementKg: rule.incrementKg };
}

export type Stall = { weightKg: number; reps: number };
// The Stall's suggestion: the next Rep Range, with the weight and reps to start it at.
export type RepRangeShift = Stall & { repMin: number; repMax: number };

const STALL_RESET = 0.9;

// The Exercise's regular Sessions that have Working Sets, with their Working Sets and local dates. A
// bodyweight Exercise is lifted at the lifter's average bodyweight plus the added weight, as for
// Personal Records: `averageKg` holds that bodyweight per Session (0 when not a bodyweight Exercise),
// and is undefined without a check-in, when a Session can't be judged.
function exerciseSessions(history: TrainingHistory, exercise: string) {
  const done = regularSessions(history)
    .map((session) => ({ localDate: session.localDate, working: workingSets(session).filter((set) => set.exercise === exercise && !set.custom) }))
    .filter(({ working }) => working.length > 0);
  const sessions = done.map(({ working }) => working);
  const bodyweight = !!sessions[0]?.[0].bodyweight;
  const averageKg = done.map(({ localDate }) => (bodyweight ? averageBodyweight(history.profile?.bodyweightKg ?? [], localDate) : 0));
  return { sessions, dates: done.map(({ localDate }) => localDate), bodyweight, averageKg };
}

// The reset Fatigue asks for: about 10% under the last Session's training weight,
// rounded to the Increment, back at the bottom of the Rep Range. A bodyweight Exercise drops its
// added weight by 10% of the total load, never below zero; with none added there is nothing to drop.
function resetAdvice({ sessions, bodyweight, averageKg }: ReturnType<typeof exerciseSessions>, rule: GoHeavierRule): Stall | undefined {
  const last = sessions.length - 1;
  const trainingKg = Math.max(...sessions[last].map((set) => set.weightKg));
  if (bodyweight && (trainingKg === 0 || averageKg[last] === undefined)) return undefined;
  const resetKg = bodyweight ? Math.max(0, trainingKg - (trainingKg + averageKg[last]!) * (1 - STALL_RESET)) : trainingKg * STALL_RESET;
  return { weightKg: Math.round(resetKg / rule.incrementKg) * rule.incrementKg, reps: rule.repMin };
}

// Fatigue and Stall (spec: Stall, Fatigue and Deload advice, ADR 0009) compare Sessions on the top
// Working Set of 1–12 reps, as an RIR-adjusted e1RM, W × (1 + (reps + RIR) / 30) with RIR 4 and over as 4.
// The adjusted figure is the engine's alone: Personal Records, ceilings and Strength Level keep e1rm().
const FATIGUE_MAX_REPS = 12;
const FATIGUE_MAX_RIR = 4;
// The "best before" a Session is the up to this many Sessions before it...
const FATIGUE_BEST_SESSIONS = 6;
// ...never reaching past the latest Session whose top Set is this much lighter than the Session before it...
const FATIGUE_WINDOW_RESET = 0.075;
// ...and Fatigue (B) is each of the last 2 Sessions at least this far under it.
const FATIGUE_REGRESSION = 0.03;
const FATIGUE_REGRESSION_SESSIONS = 2;
// Fatigue (A) is RIR falling across this many Sessions with RIR at the same top weight.
const FATIGUE_CREEP_SESSIONS = 3;

// The Exercise's Sessions with a figure to judge, each with the numbers Fatigue and Stall read from
// its Working Sets: `index` is its place among all the Exercise's Sessions, so the first
// CALIBRATION_SESSIONS can be told apart. A Session with no Set of 1–12 reps, or that can't be
// judged without a bodyweight, is left out.
function judgedSessions(done: ReturnType<typeof exerciseSessions>) {
  return done.sessions
    .map((working, index) => {
      const counted = working.filter((set) => set.reps >= 1 && set.reps <= FATIGUE_MAX_REPS);
      const bodyweightKg = done.averageKg[index];
      if (counted.length === 0 || bodyweightKg === undefined) return undefined;
      const figure = (set: Set, reps: number) => (set.weightKg + bodyweightKg) * (1 + reps / 30);
      const top = counted.reduce((a, b) => (figure(b, b.reps) > figure(a, a.reps) ? b : a));
      const withRir = counted.filter((set) => set.rir !== undefined);
      return {
        index,
        localDate: done.dates[index],
        bodyweightKg,
        loadKg: top.weightKg + bodyweightKg,
        plain: figure(top, top.reps),
        adjusted: top.rir === undefined ? undefined : figure(top, top.reps + Math.min(top.rir, FATIGUE_MAX_RIR)),
        rirTopKg: Math.max(...withRir.map((set) => set.weightKg)),
        averageRir: withRir.reduce((sum, set) => sum + Math.min(set.rir!, FATIGUE_MAX_RIR), 0) / withRir.length,
        hasRir: withRir.length > 0,
      };
    })
    .filter((session) => session !== undefined);
}
type Judged = ReturnType<typeof judgedSessions>;

// The Sessions that are the "best before" the one at `position`: up to the 6 before it, never
// reaching past the latest one whose top Set is 7.5% or more lighter than the Session before it.
function bestBeforeWindow(judged: Judged, position: number): Judged {
  let from = Math.max(0, position - FATIGUE_BEST_SESSIONS);
  for (let at = from + 1; at <= position; at++) if (judged[at].loadKg <= judged[at - 1].loadKg * (1 - FATIGUE_WINDOW_RESET)) from = at;
  return judged.slice(from, position);
}

// What a Session is compared with: the figures of the Sessions in its window. Both sides are
// RIR-adjusted when the Session logged RIR, using the window's Sessions that did too (the others can't
// be put on that scale, so they are left out); with no RIR on the Session, or on any window Session,
// everything is plain e1RM. RIR is optional, so a skipped chip is never invented.
function comparison(session: Judged[number], window: Judged): { now: number; before: { session: Judged[number]; figure: number }[] } {
  const adjusted = session.adjusted === undefined ? [] : window.filter((before) => before.adjusted !== undefined);
  return adjusted.length > 0
    ? { now: session.adjusted!, before: adjusted.map((before) => ({ session: before, figure: before.adjusted! })) }
    : { now: session.plain, before: window.map((before) => ({ session: before, figure: before.plain })) };
}

// Fatigue on an Exercise (spec: Fatigue), judged on its Working Sets only. The Calibration Sessions
// only set the baseline: the Sessions judged are all past Calibration, but they can be the "best
// before". It is Fatigued when either:
// - (A) effort creep: its last 3 Sessions with RIR logged were trained to the same top weight and
//   their average RIR fell each time, or
// - (B) regression: each of its last 2 Sessions is at least 3% under the average of its best before
//   window (the up to 6 Sessions before it).
// The suggestion is a reset about 10% lighter.
export function recommendFatigue(history: TrainingHistory, exercise: string, rule: GoHeavierRule): Stall | undefined {
  const done = exerciseSessions(history, exercise);
  const judged = judgedSessions(done);
  const past = (sessions: Judged) => sessions.every(({ index }) => index >= CALIBRATION_SESSIONS);

  const creep = judged.filter(({ hasRir }) => hasRir).slice(-FATIGUE_CREEP_SESSIONS);
  const effortCreep =
    creep.length === FATIGUE_CREEP_SESSIONS &&
    past(creep) &&
    creep.every(({ rirTopKg }) => rirTopKg === creep[0].rirTopKg) &&
    creep.every(({ averageRir }, i) => i === 0 || averageRir < creep[i - 1].averageRir);

  const underAverageBefore = (position: number) => {
    const { now, before } = comparison(judged[position], bestBeforeWindow(judged, position));
    return before.length > 0 && now <= (before.reduce((sum, { figure }) => sum + figure, 0) / before.length) * (1 - FATIGUE_REGRESSION);
  };
  const lastPositions = judged.slice(-FATIGUE_REGRESSION_SESSIONS).map((_, i) => judged.length - FATIGUE_REGRESSION_SESSIONS + i);
  const regression =
    judged.length >= FATIGUE_REGRESSION_SESSIONS && past(judged.slice(-FATIGUE_REGRESSION_SESSIONS)) && lastPositions.every(underAverageBefore);

  return effortCreep || regression ? resetAdvice(done, rule) : undefined;
}

// A Stall is at least this many Sessions without beating the best before, the last at least this
// many days after the Session that set the best (or after the Rep Range was switched, if later): 3
// weeks counted from date to date, so a Monday and the Monday 3 weeks on qualify, and 20 days do not.
const STALL_SESSIONS = 3;
const STALL_DAYS = 21;
// The remedy puts the new Rep Range's bottom at this many reps in reserve.
const STALL_RIR = 2;
// The Rep Ranges a Stall moves between, lightest first.
const STALL_RANGES = [
  [4, 6],
  [6, 8],
  [8, 10],
  [10, 12],
] as const;
// A range whose midpoint is this or more is on the light side already: the Stall moves it down, else up.
const STALL_DOWN_FROM = 8;

// The next Rep Range after a Stall: the bracket the range's midpoint falls in (a midpoint on a
// bracket's edge belongs to the lower one), one bracket down when the midpoint is 8 or more, else
// one up, within 4–6 and 10–12.
function nextRepRange({ repMin, repMax }: GoHeavierRule): readonly [number, number] {
  const midpoint = (repMin + repMax) / 2;
  const bracket = Math.max(0, STALL_RANGES.findIndex(([, top]) => midpoint <= top));
  const at = midpoint >= STALL_DOWN_FROM ? bracket - 1 : bracket + 1;
  return STALL_RANGES[Math.min(STALL_RANGES.length - 1, Math.max(0, at))];
}

// Stall (spec: Stall, Fatigue and Deload advice), accommodation: the Exercise's figure has been flat
// for weeks while the lifter is not Fatigued, so the stimulus has gone stale. Judged on the same
// figure, best-before window and Calibration handling as Fatigue. It is Stalled when the Sessions
// at the end of its history that are past Calibration and each fail to beat their best before (equal
// does not beat it; a Session with none before it cannot fail) number at least 3, counting only those
// on or after `rule.since` (the best before may reach further back), and the last Session is at least
// 21 days after the Session just before them, the one that set the best, or after `rule.since`,
// whichever is later (the best before window alone is only 6 Sessions, under 3 weeks for someone
// training 3 times a week). It is not Stalled while Fatigued.
// The suggestion is the next Rep Range, at the weight that leaves RIR 2 at its bottom from the recent
// best, rounded down to the Increment. The recent best is the best figure over the last Session's
// window and itself. A bodyweight Exercise works on bodyweight plus the added weight, which is never
// below zero.
export function recommendStall(history: TrainingHistory, exercise: string, rule: GoHeavierRule): RepRangeShift | undefined {
  const judged = judgedSessions(exerciseSessions(history, exercise));
  const failedToBeat = (position: number) => {
    const { now, before } = comparison(judged[position], bestBeforeWindow(judged, position));
    return judged[position].index >= CALIBRATION_SESSIONS && before.length > 0 && now <= Math.max(...before.map(({ figure }) => figure));
  };
  let first = judged.length;
  while (first > 0 && failedToBeat(first - 1)) first--;
  const failing = judged.slice(first).filter(({ localDate }) => rule.since === undefined || localDate >= rule.since);
  if (failing.length < STALL_SESSIONS) return undefined;

  const lastPosition = judged.length - 1;
  const last = judged[lastPosition];
  const setTheBest = judged[Math.max(0, first - 1)].localDate;
  const from = rule.since !== undefined && rule.since > setTheBest ? rule.since : setTheBest;
  const days = (Date.parse(`${last.localDate}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days < STALL_DAYS || recommendFatigue(history, exercise, rule)) return undefined;

  const { now, before } = comparison(last, bestBeforeWindow(judged, lastPosition));
  const bestE1rm = Math.max(now, ...before.map(({ figure }) => figure));
  const [repMin, repMax] = nextRepRange(rule);
  const addedKg = Math.max(0, bestE1rm / (1 + (repMin + STALL_RIR) / 30) - last.bodyweightKg);
  // Rounded down to the Increment (the nudge keeps a float like 74.999999 from dropping a step).
  return { weightKg: Math.floor(addedKg / rule.incrementKg + 1e-9) * rule.incrementKg, reps: repMin, repMin, repMax };
}

export type Recommendation = ({ kind: 'goHeavier' } & GoHeavier) | ({ kind: 'stall' } & RepRangeShift) | ({ kind: 'fatigue' } & Stall);

// The one piece of advice for an Exercise: Fatigue, else Stall, else go heavier. Fatigue wins over
// everything, since a tired lifter needs less, not more. A Stall wins over going heavier: heavier
// is no use to a lifter who has stopped improving, and they never show together.
export function recommend(history: TrainingHistory, exercise: string, rule: GoHeavierRule): Recommendation | undefined {
  const fatigue = recommendFatigue(history, exercise, rule);
  if (fatigue) return { kind: 'fatigue', ...fatigue };
  const stall = recommendStall(history, exercise, rule);
  if (stall) return { kind: 'stall', ...stall };
  const heavier = recommendGoHeavier(history, exercise, rule);
  return heavier && { kind: 'goHeavier', ...heavier };
}

// A Deload Week is the Routine with about half the Sets at about this much of the weight.
const DELOAD_WEIGHT = 0.9;
// A Deload Week is not suggested within this many weeks of the last one's start, and a dismissed
// suggestion keeps quiet for as long, as do the first this many weeks of training (counted from the
// week of the first Session). The lifter's own start is never limited.
export const DELOAD_GAP_WEEKS = 4;
// A Deload Week is suggested when Fatigue shows on Exercises of this many different compound
// Movement Patterns (ADR 0009).
const DELOAD_MIN_PATTERNS = 2;
// ...or on one pattern after this many weeks in a row of hard training (connective tissue adapts more
// slowly than muscle), a week being hard at this average RIR or less.
const HARD_STREAK_WEEKS = 6;
const HARD_STREAK_RIR = 1;

export type DeloadReason = 'fatigue';

const weeksBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (7 * 86_400_000));

// Whether the lifter can start a Deload Week in the week of the local date: any week that is not
// already a Deload Week, however recent the last one (ADR 0007).
export function canStartDeload(history: TrainingHistory, today: string): boolean {
  return !(history.deloadWeeks ?? []).includes(weekStart(today));
}

// The weeks (as their Mondays, oldest first) that count as deloaded: those whose Deload Week is
// accepted (a cancelled one is not) and those holding at least one Deload Session, however their
// Deload Week ended (spec: Deload Week).
export function deloadedWeeks(history: TrainingHistory): string[] {
  const weeks = new Set(history.deloadWeeks ?? []);
  for (const session of history.sessions) if (session.deload) weeks.add(weekStart(session.localDate));
  return [...weeks].sort();
}

// Whether the week before the local date's counts as deloaded, so starting another asks first.
export function deloadedLastWeek(history: TrainingHistory, today: string): boolean {
  return deloadedWeeks(history).some((week) => weeksBetween(week, weekStart(today)) === 1);
}

// Whether the lifter trained hard for the HARD_STREAK_WEEKS weeks in a row before the week of the
// local date: each week's average RIR over compound Working Sets with RIR logged is at most
// HARD_STREAK_RIR (RIR 4 and over as 4). A week with no such Set, or a deloaded week, breaks it, and
// Deload Sessions do not count. `patternOf` gives an Exercise's Movement Pattern (none: isolation).
function highIntensityStreak(history: TrainingHistory, today: string, patternOf: (exercise: string) => MovementPattern | null | undefined): boolean {
  const deloaded = new Set(deloadedWeeks(history));
  const rirByWeek = new Map<string, number[]>();
  for (const session of history.sessions) {
    if (session.deload) continue;
    const week = weekStart(session.localDate);
    for (const set of workingSets(session)) {
      if (set.rir === undefined || !isCompound(patternOf(set.exercise))) continue;
      rirByWeek.set(week, [...(rirByWeek.get(week) ?? []), Math.min(set.rir, FATIGUE_MAX_RIR)]);
    }
  }
  for (let ago = 1; ago <= HARD_STREAK_WEEKS; ago++) {
    const week = new Date(Date.parse(`${weekStart(today)}T00:00:00Z`) - ago * 7 * 86_400_000).toISOString().slice(0, 10);
    const rirs = rirByWeek.get(week);
    if (deloaded.has(week) || !rirs || rirs.reduce((sum, rir) => sum + rir, 0) / rirs.length > HARD_STREAK_RIR) return false;
  }
  return true;
}

// Why a Deload Week is recommended in the week of the local date, if it is (spec: Deload Week):
// Fatigue on Exercises of two or more different compound Movement Patterns among `exercises`, which
// are the Routine's, or the ones trained lately with no Routine. Two Fatigued presses are one
// pattern; Stalls, isolation and Custom Exercises (no pattern) do not count. After a high-intensity
// streak one pattern is enough, and `streak` says it decided the answer; the streak alone suggests
// nothing. `patternOf` reads the Movement Pattern of any Exercise trained in the weeks of the streak,
// not only `exercises` (the default). `exercises` in the answer are the Fatigued compound ones, one
// per pattern first, so the first two can be named. None is suggested within DELOAD_GAP_WEEKS of the
// week of the first Session. `dismissed` holds the Mondays of the weeks the lifter dismissed a
// suggestion in.
export function recommendDeload(
  history: TrainingHistory,
  today: string,
  exercises: { exercise: string; rule: GoHeavierRule; pattern?: MovementPattern | null }[],
  dismissed: readonly string[] = [],
  patternOf: (exercise: string) => MovementPattern | null | undefined = (exercise) => exercises.find((lift) => lift.exercise === exercise)?.pattern,
): { reason: DeloadReason; exercises: string[]; streak?: true } | undefined {
  const week = weekStart(today);
  if ((history.deloadWeeks ?? []).some((started) => weeksBetween(started, week) < DELOAD_GAP_WEEKS)) return undefined;
  if (dismissed.some((quiet) => weeksBetween(quiet, week) < DELOAD_GAP_WEEKS)) return undefined;
  if (history.sessions[0] && weeksBetween(weekStart(history.sessions[0].localDate), week) < DELOAD_GAP_WEEKS) return undefined;
  const fatigued = exercises.filter(({ exercise, rule, pattern }) => isCompound(pattern) && recommendFatigue(history, exercise, rule));
  const patterns = new Set(fatigued.map(({ pattern }) => pattern));
  if (patterns.size === 0) return undefined;
  const streak = patterns.size < DELOAD_MIN_PATTERNS;
  if (streak && !highIntensityStreak(history, today, patternOf)) return undefined;
  const first = fatigued.filter(({ pattern }, i) => fatigued.findIndex((other) => other.pattern === pattern) === i);
  return {
    reason: 'fatigue',
    exercises: [...first, ...fatigued.filter((lift) => !first.includes(lift))].map(({ exercise }) => exercise),
    ...(streak && { streak }),
  };
}

// The rows of an Exercise's Sets in a Deload Week (spec: Deload Week), from the rows a regular
// Session would start with: the last half of them (at least one), about 10% lighter and rounded to
// the Increment. A weight of none stays none.
export function deloadRows<T extends { weightKg: number }>(rows: readonly (T | undefined)[], incrementKg: number): (T | undefined)[] {
  return rows.slice(rows.length - Math.max(1, Math.ceil(rows.length / 2))).map((row) =>
    row && { ...row, weightKg: row.weightKg === 0 ? 0 : Math.round((row.weightKg * DELOAD_WEIGHT) / incrementKg) * incrementKg },
  );
}
export * from './rank-up.ts';
export * from './time-left.ts';
export * from './period-end.ts';
