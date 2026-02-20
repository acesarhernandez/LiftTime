export const trainingModes = ["BEGINNER", "ADVANCED"] as const;
export type TrainingMode = (typeof trainingModes)[number];

export const beginnerEffortGrades = ["EASY", "MODERATE", "HARD", "MAX"] as const;
export type BeginnerEffortGrade = (typeof beginnerEffortGrades)[number];

export const beginnerEffortToRir: Record<BeginnerEffortGrade, number> = {
  EASY: 4,
  MODERATE: 2,
  HARD: 1,
  MAX: 0
};

export function supportsPerSetRir(trainingMode: TrainingMode | null | undefined): boolean {
  return trainingMode === "ADVANCED";
}
