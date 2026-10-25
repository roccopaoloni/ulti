// ULTI's rules: pure functions shared by the client and the server, with no I/O.

export type Set = {
  exercise: string;
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
