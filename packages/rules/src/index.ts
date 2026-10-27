// ULTI's rules: pure functions shared by the client and the server, with no I/O.

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
};

export type SetLabel = 'warm-up' | 'working';

export type Session = {
  localDate: string;
  sets: Set[];
};

export type TrainingHistory = {
  userId: string;
  sessions: Session[];
  // The dated Weekly Target history (ADR 0002).
  weeklyTargets: Dated<number>[];
  // Sex and bodyweight check-ins, dated (ADR 0002). Bodyweight Exercises are scored with the
  // average bodyweight; without them every other Personal Record is weighted as the 50th percentile.
  profile?: { sex: Dated<Sex>[]; bodyweightKg: Dated<number>[] };
};

// Bump when a change to the rules changes the events they derive, so stored events show which rules made them.
export const RULES_VERSION = 2;

// A lifter's first Sessions with an Exercise only set their starting best (spec: Calibration).
export const CALIBRATION_SESSIONS = 2;
// Only Sets of 1–12 reps can be Personal Records, so a switch to high-rep Sets can't fake one.
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
};

// The Consistency Points a week of meeting the Weekly Target is worth, the same for everyone. 120
// splits evenly for every target from 2 to 6. Kept at 120 by the simulation (#31) with 22 Progress Points per 1%.
export const CONSISTENCY_WEEKLY_AMOUNT = 120;
// A qualifying Session has at least this many Working Sets (spec: Consistency Points).
export const QUALIFYING_WORKING_SETS = 6;

// A week's Consistency Points (spec: Consistency Points): the share of the Weekly Target completed.
export type ConsistencyWeek = {
  kind: 'consistency';
  id: string;
  // The Monday that starts the week, as a local date.
  week: string;
  weeklyTarget: number;
  // The local dates of the qualifying Sessions that counted, at most the Weekly Target.
  sessionDates: string[];
  rulesVersion: number;
  consistencyPoints: number;
};

// Each kind of Scoring Event joins this union as its rules land.
export type ScoringEvent = PersonalRecord | ConsistencyWeek;

// The estimated one-rep max by the Epley formula, used everywhere (spec: e1RM).
export function e1rm(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

// Whether the Exercise's Sessions so far, the one in progress included, are all still setting the
// lifter's baseline: the app says so (spec: Calibration copy).
export function inCalibration(history: TrainingHistory, exercise: string): boolean {
  const sessions = history.sessions.filter((session) =>
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

export function deriveScoringEvents(history: TrainingHistory): ScoringEvent[] {
  return [...derivePersonalRecords(history), ...deriveConsistency(history)];
}

function derivePersonalRecords(history: TrainingHistory): PersonalRecord[] {
  const events: PersonalRecord[] = [];
  const bests = new Map<string, number>();
  const sessionsDone = new Map<string, number>();
  for (const session of history.sessions) {
    // Only Working Sets reach scoring (spec: Warm-up detection), and Custom Exercises never score.
    const working = workingSets(session).filter((set) => !set.custom);
    for (const exercise of new Set(working.map((set) => set.exercise))) {
      const calibrating = (sessionsDone.get(exercise) ?? 0) < CALIBRATION_SESSIONS;
      sessionsDone.set(exercise, (sessionsDone.get(exercise) ?? 0) + 1);
      // At most one Personal Record per Exercise per Session, for its best eligible Set, so a jump
      // split across Sets can't dodge the per-record cap.
      const eligible = working.filter((s) => s.exercise === exercise && s.reps <= MAX_RECORD_REPS);
      if (eligible.length === 0) continue;
      // A bodyweight Exercise is lifted at the lifter's recent average bodyweight plus the added
      // weight, so a short swing can't create or erase a record. Without a check-in it can't be scored.
      const averageKg = eligible[0].bodyweight ? averageBodyweight(history.profile?.bodyweightKg ?? [], session.localDate) : null;
      if (averageKg === undefined) continue;
      const load = (s: Set) => s.weightKg + (averageKg ?? 0);
      const set = eligible.reduce((top, s) => (e1rm(load(s), s.reps) > e1rm(load(top), top.reps) ? s : top));
      const value = e1rm(load(set), set.reps);
      const best = bests.get(exercise) ?? 0;
      if (value <= best) continue;
      bests.set(exercise, value);
      if (calibrating || best === 0) continue;
      const gain = (value / best - 1) * 100;
      const sex = valueInForce(history.profile?.sex ?? [], session.localDate) ?? 'unspecified';
      const bodyweightKg = averageKg ?? valueInForce(history.profile?.bodyweightKg ?? [], session.localDate) ?? null;
      let percentile = DEFAULT_PERCENTILE;
      if (bodyweightKg !== null && !BODYWEIGHT_BENCHMARKS.has(exercise)) {
        // A Benchmark Lift is measured by its own e1RM; any other Exercise by the average of the
        // lifter's levels on the Benchmark Lifts they do, each at their best e1RM so far.
        const own = strengthLevelPercentile(exercise, value, sex, bodyweightKg);
        const levels = [...bests]
          .filter(([lift]) => !BODYWEIGHT_BENCHMARKS.has(lift))
          .flatMap(([lift, liftBest]) => strengthLevelPercentile(lift, liftBest, sex, bodyweightKg) ?? []);
        percentile = own ?? (levels.length === 0 ? DEFAULT_PERCENTILE : levels.reduce((a, b) => a + b, 0) / levels.length);
      }
      const weight = STRENGTH_WEIGHT_RANGE ** ((percentile - 50) / WEIGHT_SPAN_PERCENTILES);
      events.push({
        kind: 'personal-record',
        id: `${history.userId}:personal-record:${set.id}`,
        exercise,
        setId: set.id,
        localDate: session.localDate,
        previousE1rm: best,
        newE1rm: value,
        percentGain: Math.round(gain * 100) / 100,
        strengthLevelPercentile: Math.round(percentile * 100) / 100,
        bodyweightKg,
        rulesVersion: RULES_VERSION,
        progressPoints: Math.min(MAX_POINTS_PER_RECORD, Math.round(gain * POINTS_PER_PERCENT_GAIN * weight)),
      });
    }
  }
  return events;
}

function deriveConsistency(history: TrainingHistory): ConsistencyWeek[] {
  // Only Working Sets reach scoring (spec: Warm-up detection).
  const qualifying = history.sessions.filter((session) => workingSets(session).length >= QUALIFYING_WORKING_SETS);
  const events: ConsistencyWeek[] = [];
  for (const week of [...new Set(qualifying.map((session) => weekStart(session.localDate)))].sort()) {
    const weeklyTarget = weeklyTargetOf(history.weeklyTargets, week);
    if (weeklyTarget === undefined) continue;
    const sessionDates = qualifying
      .filter((session) => weekStart(session.localDate) === week)
      .map((session) => session.localDate)
      .slice(0, weeklyTarget);
    events.push({
      kind: 'consistency',
      id: `${history.userId}:consistency:${week}`,
      week,
      weeklyTarget,
      sessionDates,
      rulesVersion: RULES_VERSION,
      consistencyPoints: (CONSISTENCY_WEEKLY_AMOUNT * sessionDates.length) / weeklyTarget,
    });
  }
  return events;
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

// Labels one Exercise's Sets of one Session, in the order they were logged: a Set is a Warm-up Set
// when it comes before the first Set within 10% of the heaviest weight, so back-off Sets after the
// top Set stay Working Sets. A lifter's override wins over the detected label.
export function labelSets(sets: { weightKg: number; label?: SetLabel }[]): SetLabel[] {
  const heaviest = Math.max(...sets.map((set) => set.weightKg));
  const firstWorking = sets.findIndex((set) => set.weightKg >= heaviest * 0.9);
  return sets.map((set, index) => set.label ?? (index < firstWorking ? 'warm-up' : 'working'));
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

// The Increment shown in the user's units: the nearest half, since a plate pair in lb is never finer.
export const incrementInUnits = (incrementKg: number, units: Units) =>
  units === 'kg' ? incrementKg : Math.round(kgToUnits(incrementKg, units) * 2) / 2;

// A Routine: its Sessions (Routine Days), each listing Exercises with a number of Sets and a Rep Range.
export type RoutineExercise = { exerciseId: string; sets: number; repMin: number; repMax: number };
export type RoutineDay = { id: string; name: string; exercises: RoutineExercise[] };

// The Weekly Target a Routine suggests: one Session a week per Routine Day, within the 2–6 a
// Weekly Target can be.
export function suggestedWeeklyTarget(routineDays: number): number {
  return Math.min(6, Math.max(2, routineDays));
}

// The Routine Day to do next: the one after the last Session done from the Routine, wrapping
// around; the first when there is none or it was removed from the Routine.
export function nextRoutineDay(dayIds: readonly string[], lastDoneId: string | undefined): string {
  const last = lastDoneId === undefined ? -1 : dayIds.indexOf(lastDoneId);
  return dayIds[(last + 1) % dayIds.length];
}

// The rows of an Exercise's Sets still to do when a Session starts: the last Session's Sets, with
// the Routine Day's planned Sets filling any rows past them by repeating the last one (an empty
// row when there was no earlier Session). If the last Session had more Sets than planned, all stay.
export function plannedRows<T>(lastSets: readonly T[], plannedSets: number | undefined): (T | undefined)[] {
  const rows: (T | undefined)[] = [...lastSets];
  while (rows.length < (plannedSets ?? 0)) rows.push(lastSets.at(-1));
  return rows;
}

export * from './rank.ts';

// What an Exercise is trained to in a Routine, and the Increment that applies to it.
export type GoHeavierRule = { repMin: number; repMax: number; incrementKg: number };
export type GoHeavier = { weightKg: number; reps: number; incrementKg: number };

// Double progression (spec: Go heavier): once every Working Set of the Exercise's last Session
// reached the top of its Rep Range, the next Session is the Increment heavier with reps back at the
// bottom of the range.
export function recommendGoHeavier(history: TrainingHistory, exercise: string, rule: GoHeavierRule): GoHeavier | undefined {
  const sessions = history.sessions
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
