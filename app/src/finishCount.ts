import type { RoutineExercise } from '@ulti/rules';

// What the finish sheet says: Sets logged, and, for a Session started from a Routine Day, the Sets that
// day plans. Only Sets of planned Exercises count against the plan, and no Exercise counts past its plan.
export function finishCount(plan: readonly RoutineExercise[], sets: readonly { exerciseId: string }[]): { logged: number; planned?: number } {
  if (plan.length === 0) return { logged: sets.length };
  const planned = plan.reduce((total, exercise) => total + exercise.sets, 0);
  const logged = plan.reduce((total, exercise) => total + Math.min(exercise.sets, sets.filter((set) => set.exerciseId === exercise.exerciseId).length), 0);
  return { logged, planned };
}
