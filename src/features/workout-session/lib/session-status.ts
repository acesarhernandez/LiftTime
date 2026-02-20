import { WorkoutSessionExercise, WorkoutSet, WorkoutSetType } from "@/features/workout-session/types/workout-set";

export const workoutSetVisualStatuses = ["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "MISSING_DATA"] as const;
export type WorkoutSetVisualStatus = (typeof workoutSetVisualStatuses)[number];

export const workoutExerciseVisualStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED"] as const;
export type WorkoutExerciseVisualStatus = (typeof workoutExerciseVisualStatuses)[number];

function getWeightValue(set: WorkoutSet, columnIndex: number): number {
  if (!Array.isArray(set.valuesInt)) {
    return 0;
  }

  return Number(set.valuesInt[columnIndex] ?? 0);
}

function getTimeValue(set: WorkoutSet, columnIndex: number): number {
  const minutes = Number(set.valuesInt?.[columnIndex] ?? 0);
  const seconds = Number(set.valuesSec?.[columnIndex] ?? 0);
  return minutes * 60 + seconds;
}

function hasValueForType(set: WorkoutSet, type: WorkoutSetType, columnIndex: number): boolean {
  if (type === "REPS") {
    return getWeightValue(set, columnIndex) > 0;
  }

  if (type === "WEIGHT") {
    return getWeightValue(set, columnIndex) > 0;
  }

  if (type === "TIME") {
    return getTimeValue(set, columnIndex) > 0;
  }

  if (type === "BODYWEIGHT") {
    return true;
  }

  return false;
}

export function hasAnySetData(set: WorkoutSet): boolean {
  const hasNumericData = [...(set.valuesInt ?? []), ...(set.valuesSec ?? [])].some((value) => Number(value) > 0);
  const hasRirData = typeof set.rir === "number";
  const hasPainData = typeof set.painLevel === "string" && set.painLevel !== "NONE";
  return hasNumericData || hasRirData || hasPainData;
}

export function hasRequiredSetData(set: WorkoutSet): boolean {
  if (!Array.isArray(set.types) || set.types.length === 0) {
    return false;
  }

  return set.types.every((type, index) => hasValueForType(set, type, index));
}

export function getWorkoutSetVisualStatus(set: WorkoutSet): WorkoutSetVisualStatus {
  if (set.completed) {
    return hasRequiredSetData(set) ? "COMPLETE" : "MISSING_DATA";
  }

  if (hasAnySetData(set)) {
    return "IN_PROGRESS";
  }

  return "NOT_STARTED";
}

export function getWorkoutExerciseVisualStatus(exercise: WorkoutSessionExercise): WorkoutExerciseVisualStatus {
  if (!exercise.sets.length) {
    return "PENDING";
  }

  const setStatuses = exercise.sets.map(getWorkoutSetVisualStatus);
  if (setStatuses.every((status) => status === "COMPLETE")) {
    return "COMPLETED";
  }

  if (setStatuses.some((status) => status !== "NOT_STARTED")) {
    return "IN_PROGRESS";
  }

  return "PENDING";
}

export function getCompletedSetCount(exercise: WorkoutSessionExercise): number {
  return exercise.sets.filter((set) => set.completed).length;
}
