// ULTI's rules: pure functions shared by the client and the server, with no I/O.

export type Set = {
  exercise: string;
  // A Custom Exercise: its Sets count toward a Session, but never earn Progress Points or get
  // recommendations.
  custom: boolean;
  weightKg: number;
  reps: number;
  // The lifter's one-tap override of the detected label (spec: Warm-up detection).
  label?: SetLabel;
};

export type SetLabel = 'warm-up' | 'working';

export type Session = {
  localDate: string;
  sets: Set[];
};

export type TrainingHistory = {
  sessions: Session[];
};

// Each kind of Scoring Event joins this union as its rules land.
export type ScoringEvent = never;

export function deriveScoringEvents(history: TrainingHistory): ScoringEvent[] {
  // Only Working Sets reach scoring (spec: Warm-up detection); no Scoring Event kind uses them yet.
  history.sessions.map(workingSets);
  return [];
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
