// ULTI's rules: pure functions shared by the client and the server, with no I/O.

export type Set = {
  exercise: string;
  // A Custom Exercise: its Sets count toward a Session, but never earn Progress Points or get
  // recommendations.
  custom: boolean;
  weightKg: number;
  reps: number;
};

export type Session = {
  localDate: string;
  sets: Set[];
};

export type TrainingHistory = {
  sessions: Session[];
};

// Each kind of Scoring Event joins this union as its rules land.
export type ScoringEvent = never;

export function deriveScoringEvents(_history: TrainingHistory): ScoringEvent[] {
  return [];
}

// What the logging keypad's + (direction 1) and − (direction -1) do to a weight or a rep count:
// step by the Exercise's Increment (reps use 1), never below zero.
export function stepValue(current: number, increment: number, direction: 1 | -1): number {
  return Math.max(0, Math.round((current + direction * increment) * 1000) / 1000);
}
