import { ExerciseAttributeNameEnum, ExerciseAttributeValueEnum, WeightUnit, WorkoutSetType as PrismaWorkoutSetType } from "@prisma/client";

import { convertWeight } from "@/shared/lib/weight-conversion";
import { SuggestedWorkoutSet, WorkoutSetDbType, WorkoutSetType, WorkoutSetUnit } from "@/features/workout-session/types/workout-set";
import { ExerciseAttribute } from "@/entities/exercise/types/exercise.types";
import { MuscleFatigueStatus } from "@/features/workout-session/model/workout-session-read-model";

interface RepRange {
  min: number;
  max: number;
}

interface GoalConfig {
  repRange: RepRange;
  defaultWorkingSets: number;
  upperBodyIncreasePercent: number;
  lowerBodyIncreasePercent: number;
  deloadPercent: number;
}

export const PROGRESSION_GOALS = {
  STRENGTH: {
    repRange: { min: 4, max: 6 },
    defaultWorkingSets: 4,
    upperBodyIncreasePercent: 0.03,
    lowerBodyIncreasePercent: 0.05,
    deloadPercent: 0.05
  },
  HYPERTROPHY: {
    repRange: { min: 8, max: 12 },
    defaultWorkingSets: 3,
    upperBodyIncreasePercent: 0.025,
    lowerBodyIncreasePercent: 0.05,
    deloadPercent: 0.05
  },
  ENDURANCE: {
    repRange: { min: 12, max: 15 },
    defaultWorkingSets: 3,
    upperBodyIncreasePercent: 0.02,
    lowerBodyIncreasePercent: 0.03,
    deloadPercent: 0.05
  }
} as const satisfies Record<string, GoalConfig>;

export type ProgressionGoal = keyof typeof PROGRESSION_GOALS;

export interface HistoricalSet {
  workoutSessionId: string;
  startedAt: Date;
  setIndex: number;
  type: PrismaWorkoutSetType;
  reps: number | null;
  weight: number | null;
  weightUnit: WeightUnit | null;
  durationSec: number | null;
}

interface HistoricalWorkout {
  workoutSessionId: string;
  startedAt: Date;
  sets: HistoricalSet[];
}

interface SetOutcome {
  success: boolean;
  failure: boolean;
  averageReps: number | null;
  averageWeight: number | null;
}

export interface ExerciseRecommendationInput {
  exerciseId: string;
  attributes: ExerciseAttribute[];
  recentSets: HistoricalSet[];
  goal?: ProgressionGoal;
  preferredUnit?: WeightUnit;
  includeWarmupSets?: boolean;
  successStreakThreshold?: number;
  analysisWorkoutCount?: number;
  fallbackPrimaryMuscle?: ExerciseAttributeValueEnum | null;
  muscleFatigueStatus?: MuscleFatigueStatus;
  muscleCurrentWeekSets?: number;
  muscleTargetMinSets?: number;
  muscleTargetMaxSets?: number;
}

export interface ExerciseRecommendation {
  exerciseId: string;
  goal: ProgressionGoal;
  workingWeight: number | null;
  workingReps: number;
  workingSets: number;
  unit: WeightUnit;
  successStreak: number;
  failureStreak: number;
  reason: string;
  sets: SuggestedWorkoutSet[];
}

const BARBELL_EQUIPMENT = new Set<ExerciseAttributeValueEnum>([
  ExerciseAttributeValueEnum.BARBELL,
  ExerciseAttributeValueEnum.EZ_BAR,
  ExerciseAttributeValueEnum.SMITH_MACHINE,
  ExerciseAttributeValueEnum.RACK,
  ExerciseAttributeValueEnum.BAR
]);

const DUMBBELL_EQUIPMENT = new Set<ExerciseAttributeValueEnum>([
  ExerciseAttributeValueEnum.DUMBBELL,
  ExerciseAttributeValueEnum.KETTLEBELLS
]);

const MACHINE_EQUIPMENT = new Set<ExerciseAttributeValueEnum>([
  ExerciseAttributeValueEnum.MACHINE,
  ExerciseAttributeValueEnum.CABLE
]);

const BODYWEIGHT_EQUIPMENT = new Set<ExerciseAttributeValueEnum>([
  ExerciseAttributeValueEnum.BODY_ONLY,
  ExerciseAttributeValueEnum.NONE
]);

const LOWER_BODY_MUSCLES = new Set<ExerciseAttributeValueEnum>([
  ExerciseAttributeValueEnum.QUADRICEPS,
  ExerciseAttributeValueEnum.HAMSTRINGS,
  ExerciseAttributeValueEnum.GLUTES,
  ExerciseAttributeValueEnum.CALVES,
  ExerciseAttributeValueEnum.ADDUCTORS,
  ExerciseAttributeValueEnum.ABDUCTORS,
  ExerciseAttributeValueEnum.GROIN
]);

const MUSCLE_BASE_WEIGHTS_KG: Partial<Record<ExerciseAttributeValueEnum, number>> = {
  [ExerciseAttributeValueEnum.CHEST]: 20,
  [ExerciseAttributeValueEnum.BACK]: 25,
  [ExerciseAttributeValueEnum.LATS]: 25,
  [ExerciseAttributeValueEnum.BICEPS]: 10,
  [ExerciseAttributeValueEnum.TRICEPS]: 10,
  [ExerciseAttributeValueEnum.SHOULDERS]: 12.5,
  [ExerciseAttributeValueEnum.TRAPS]: 15,
  [ExerciseAttributeValueEnum.FOREARMS]: 8,
  [ExerciseAttributeValueEnum.QUADRICEPS]: 30,
  [ExerciseAttributeValueEnum.HAMSTRINGS]: 30,
  [ExerciseAttributeValueEnum.GLUTES]: 35,
  [ExerciseAttributeValueEnum.CALVES]: 25,
  [ExerciseAttributeValueEnum.FULL_BODY]: 25
};

const WARMUP_REP_SCHEME = [8, 5];

function getAttributeName(attribute: ExerciseAttribute): ExerciseAttributeNameEnum {
  return typeof attribute.attributeName === "string" ? attribute.attributeName : attribute.attributeName.name;
}

function getAttributeValue(attribute: ExerciseAttribute): ExerciseAttributeValueEnum {
  return typeof attribute.attributeValue === "string" ? attribute.attributeValue : attribute.attributeValue.value;
}

function getAttributeValues(attributes: ExerciseAttribute[], attributeName: ExerciseAttributeNameEnum): ExerciseAttributeValueEnum[] {
  return attributes.filter((attribute) => getAttributeName(attribute) === attributeName).map(getAttributeValue);
}

function getPrimaryMuscle(attributes: ExerciseAttribute[]): ExerciseAttributeValueEnum | null {
  const primaryMuscle = getAttributeValues(attributes, ExerciseAttributeNameEnum.PRIMARY_MUSCLE)[0];
  return primaryMuscle ?? null;
}

function getEquipment(attributes: ExerciseAttribute[]): ExerciseAttributeValueEnum | null {
  const equipment = getAttributeValues(attributes, ExerciseAttributeNameEnum.EQUIPMENT)[0];
  return equipment ?? null;
}

function getExerciseType(attributes: ExerciseAttribute[]): ExerciseAttributeValueEnum | null {
  const exerciseType = getAttributeValues(attributes, ExerciseAttributeNameEnum.TYPE)[0];
  return exerciseType ?? null;
}

function isLowerBody(primaryMuscle: ExerciseAttributeValueEnum | null): boolean {
  if (!primaryMuscle) return false;
  return LOWER_BODY_MUSCLES.has(primaryMuscle);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

export function getWeightIncrement(unit: WeightUnit, equipment: ExerciseAttributeValueEnum | null): number {
  if (DUMBBELL_EQUIPMENT.has(equipment ?? ExerciseAttributeValueEnum.NA)) {
    return unit === WeightUnit.kg ? 1 : 2.5;
  }

  if (BARBELL_EQUIPMENT.has(equipment ?? ExerciseAttributeValueEnum.NA)) {
    return unit === WeightUnit.kg ? 2.5 : 5;
  }

  if (MACHINE_EQUIPMENT.has(equipment ?? ExerciseAttributeValueEnum.NA)) {
    return unit === WeightUnit.kg ? 2.5 : 5;
  }

  return unit === WeightUnit.kg ? 1 : 2.5;
}

export function roundToAvailableIncrement(weight: number, unit: WeightUnit, equipment: ExerciseAttributeValueEnum | null): number {
  const increment = getWeightIncrement(unit, equipment);
  if (weight <= 0) {
    return increment;
  }

  return roundToTwoDecimals(Math.round(weight / increment) * increment);
}

function roundLoadChange(weight: number, unit: WeightUnit, equipment: ExerciseAttributeValueEnum | null, direction: "up" | "down"): number {
  const increment = getWeightIncrement(unit, equipment);
  const scaled = weight / increment;
  const rounded = direction === "up" ? Math.ceil(scaled) * increment : Math.floor(scaled) * increment;

  return roundToTwoDecimals(Math.max(increment, rounded));
}

function toPreferredUnitWeight(weight: number, sourceUnit: WeightUnit | null, preferredUnit: WeightUnit): number {
  const weightUnit = sourceUnit ?? preferredUnit;
  return convertWeight(weight, weightUnit, preferredUnit);
}

function groupRecentWorkouts(sets: HistoricalSet[], analysisWorkoutCount: number): HistoricalWorkout[] {
  const byWorkout = new Map<string, HistoricalWorkout>();

  sets.forEach((set) => {
    const existing = byWorkout.get(set.workoutSessionId);
    if (!existing) {
      byWorkout.set(set.workoutSessionId, {
        workoutSessionId: set.workoutSessionId,
        startedAt: set.startedAt,
        sets: [set]
      });
      return;
    }

    existing.sets.push(set);
  });

  return Array.from(byWorkout.values())
    .map((workout) => ({
      ...workout,
      sets: workout.sets.sort((firstSet, secondSet) => firstSet.setIndex - secondSet.setIndex)
    }))
    .sort((firstWorkout, secondWorkout) => secondWorkout.startedAt.getTime() - firstWorkout.startedAt.getTime())
    .slice(0, analysisWorkoutCount);
}

function getWeightedWorkingSets(workout: HistoricalWorkout): HistoricalSet[] {
  return workout.sets.filter((set) => {
    return set.type !== PrismaWorkoutSetType.WARMUP && set.weight !== null && set.reps !== null;
  });
}

function evaluateWorkoutOutcome(workout: HistoricalWorkout, repRange: RepRange, preferredUnit: WeightUnit): SetOutcome {
  const weightedSets = getWeightedWorkingSets(workout);

  if (weightedSets.length === 0) {
    return {
      success: false,
      failure: false,
      averageReps: null,
      averageWeight: null
    };
  }

  const repsValues = weightedSets.map((set) => set.reps as number);
  const convertedWeights = weightedSets.map((set) => toPreferredUnitWeight(set.weight as number, set.weightUnit, preferredUnit));

  const setCount = repsValues.length;
  const successSets = repsValues.filter((reps) => reps >= repRange.max).length;
  const failureSets = repsValues.filter((reps) => reps < repRange.min).length;

  return {
    success: successSets >= Math.ceil(setCount * 0.67),
    failure: failureSets >= Math.ceil(setCount * 0.67),
    averageReps: average(repsValues),
    averageWeight: average(convertedWeights)
  };
}

function countConsecutiveOutcomes(outcomes: SetOutcome[], outcomeKey: "success" | "failure"): number {
  let streak = 0;

  for (const outcome of outcomes) {
    if (outcome[outcomeKey]) {
      streak += 1;
      continue;
    }

    break;
  }

  return streak;
}

function getGoalWeightMultiplier(goal: ProgressionGoal): number {
  if (goal === "STRENGTH") {
    return 1.1;
  }

  if (goal === "ENDURANCE") {
    return 0.9;
  }

  return 1;
}

function getFallbackWorkingWeightKg(
  primaryMuscle: ExerciseAttributeValueEnum | null,
  equipment: ExerciseAttributeValueEnum | null,
  goal: ProgressionGoal
): number | null {
  if (equipment && BODYWEIGHT_EQUIPMENT.has(equipment)) {
    return null;
  }

  const muscleWeight = MUSCLE_BASE_WEIGHTS_KG[primaryMuscle ?? ExerciseAttributeValueEnum.NA] ?? 15;
  const weightedForGoal = muscleWeight * getGoalWeightMultiplier(goal);

  if (BARBELL_EQUIPMENT.has(equipment ?? ExerciseAttributeValueEnum.NA)) {
    return Math.max(weightedForGoal, 20);
  }

  if (DUMBBELL_EQUIPMENT.has(equipment ?? ExerciseAttributeValueEnum.NA)) {
    return clamp(weightedForGoal, 6, 18);
  }

  if (MACHINE_EQUIPMENT.has(equipment ?? ExerciseAttributeValueEnum.NA)) {
    return clamp(weightedForGoal, 10, 40);
  }

  return weightedForGoal;
}

function isBodyweightExercise(equipment: ExerciseAttributeValueEnum | null, exerciseType: ExerciseAttributeValueEnum | null): boolean {
  if (equipment && BODYWEIGHT_EQUIPMENT.has(equipment)) {
    return true;
  }

  return exerciseType === ExerciseAttributeValueEnum.BODYWEIGHT || exerciseType === ExerciseAttributeValueEnum.CALISTHENIC;
}

function isTimedExercise(exerciseType: ExerciseAttributeValueEnum | null): boolean {
  return exerciseType === ExerciseAttributeValueEnum.CARDIO || exerciseType === ExerciseAttributeValueEnum.STRETCHING;
}

function createWeightedSet(
  setIndex: number,
  weight: number,
  reps: number,
  unit: WeightUnit,
  type: WorkoutSetDbType,
  recommendationReason: string
): SuggestedWorkoutSet {
  const normalizedWeight = roundToTwoDecimals(weight);

  return {
    setIndex,
    type,
    types: ["WEIGHT" as WorkoutSetType, "REPS" as WorkoutSetType],
    valuesInt: [normalizedWeight, reps],
    units: [unit as WorkoutSetUnit],
    recommendationReason
  };
}

function createBodyweightSet(setIndex: number, reps: number, recommendationReason: string): SuggestedWorkoutSet {
  return {
    setIndex,
    type: PrismaWorkoutSetType.NORMAL,
    types: ["REPS" as WorkoutSetType],
    valuesInt: [reps],
    recommendationReason
  };
}

function createTimedSet(setIndex: number, durationSec: number, recommendationReason: string): SuggestedWorkoutSet {
  return {
    setIndex,
    type: PrismaWorkoutSetType.NORMAL,
    types: ["TIME" as WorkoutSetType],
    valuesSec: [durationSec],
    recommendationReason
  };
}

function buildWarmupSets(
  workingWeight: number,
  unit: WeightUnit,
  equipment: ExerciseAttributeValueEnum | null,
  recommendationReason: string
): SuggestedWorkoutSet[] {
  const warmupPercentages = [0.6, 0.8];
  const warmupSets: SuggestedWorkoutSet[] = [];

  warmupPercentages.forEach((percentage, index) => {
    const rawWarmupWeight = workingWeight * percentage;
    const roundedWeight = roundLoadChange(rawWarmupWeight, unit, equipment, "up");

    if (roundedWeight >= workingWeight) {
      return;
    }

    warmupSets.push(
      createWeightedSet(index, roundedWeight, WARMUP_REP_SCHEME[index] ?? 5, unit, PrismaWorkoutSetType.WARMUP, recommendationReason)
    );
  });

  return warmupSets;
}

export function buildExerciseRecommendation(input: ExerciseRecommendationInput): ExerciseRecommendation {
  const goal = input.goal ?? "HYPERTROPHY";
  const goalConfig = PROGRESSION_GOALS[goal];
  const preferredUnit = input.preferredUnit ?? WeightUnit.lbs;
  const includeWarmupSets = input.includeWarmupSets ?? true;
  const successStreakThreshold = input.successStreakThreshold ?? 2;
  const analysisWorkoutCount = input.analysisWorkoutCount ?? 3;

  const primaryMuscle = getPrimaryMuscle(input.attributes) ?? input.fallbackPrimaryMuscle ?? null;
  const equipment = getEquipment(input.attributes);
  const exerciseType = getExerciseType(input.attributes);

  const workouts = groupRecentWorkouts(input.recentSets, analysisWorkoutCount);
  const outcomes = workouts.map((workout) => evaluateWorkoutOutcome(workout, goalConfig.repRange, preferredUnit));

  const successStreak = countConsecutiveOutcomes(outcomes, "success");
  const failureStreak = countConsecutiveOutcomes(outcomes, "failure");

  const latestWorkout = workouts[0] ?? null;
  const latestOutcome = outcomes[0] ?? null;

  const defaultReps = Math.round((goalConfig.repRange.min + goalConfig.repRange.max) / 2);
  const workingRepsBase = latestOutcome?.averageReps !== null && latestOutcome?.averageReps !== undefined
    ? Math.round(latestOutcome.averageReps)
    : defaultReps;

  const latestWorkingSetCount = latestWorkout ? getWeightedWorkingSets(latestWorkout).length : 0;
  let workingSets = Math.max(goalConfig.defaultWorkingSets, latestWorkingSetCount);

  const latestWeight = latestOutcome?.averageWeight;
  const fallbackWeightKg = getFallbackWorkingWeightKg(primaryMuscle, equipment, goal);
  const fallbackWeightInUnit = fallbackWeightKg !== null ? convertWeight(fallbackWeightKg, WeightUnit.kg, preferredUnit) : null;

  const isWeighted = !isBodyweightExercise(equipment, exerciseType) && !isTimedExercise(exerciseType);
  let workingWeight = isWeighted ? (latestWeight ?? fallbackWeightInUnit) : null;

  let reason = "No prior completed sessions. Using conservative muscle-group defaults.";
  let workingReps = clamp(workingRepsBase, goalConfig.repRange.min, goalConfig.repRange.max);

  const appendReason = (nextReason: string) => {
    reason = `${reason} ${nextReason}`;
  };

  if (workingWeight !== null) {
    workingWeight = roundToAvailableIncrement(workingWeight, preferredUnit, equipment);
  }

  if (latestWorkout) {
    reason = "Using last workout performance as the baseline.";

    if (successStreak >= successStreakThreshold && workingWeight !== null) {
      const increasePercent = isLowerBody(primaryMuscle)
        ? goalConfig.lowerBodyIncreasePercent
        : goalConfig.upperBodyIncreasePercent;
      const increasedWeight = workingWeight * (1 + increasePercent);

      workingWeight = roundLoadChange(increasedWeight, preferredUnit, equipment, "up");
      workingReps = goalConfig.repRange.min;
      reason = `${successStreak} successful sessions. Increased load by ${Math.round(increasePercent * 100)}%.`;
    } else if (failureStreak >= successStreakThreshold && workingWeight !== null) {
      const previousWorkingWeight = workingWeight;
      const increment = getWeightIncrement(preferredUnit, equipment);
      const decreasedWeight = workingWeight * (1 - goalConfig.deloadPercent);

      const roundedDeloadWeight = roundToAvailableIncrement(decreasedWeight, preferredUnit, equipment);
      workingWeight = roundedDeloadWeight < previousWorkingWeight
        ? roundedDeloadWeight
        : roundToTwoDecimals(Math.max(increment, previousWorkingWeight - increment));
      workingReps = goalConfig.repRange.min;
      reason = `${failureStreak} difficult sessions. Deloaded by ${Math.round(goalConfig.deloadPercent * 100)}%.`;
    } else {
      workingReps = clamp(workingReps + 1, goalConfig.repRange.min, goalConfig.repRange.max);
      reason = "Progressing reps first at the same load (double progression).";
    }
  }

  if (input.muscleFatigueStatus === "HIGH") {
    const previousWorkingSets = workingSets;
    workingSets = Math.max(2, workingSets - 1);
    workingReps = clamp(workingReps - 1, goalConfig.repRange.min, goalConfig.repRange.max);

    if (workingWeight !== null && failureStreak > 0) {
      workingWeight = roundLoadChange(workingWeight * (1 - goalConfig.deloadPercent), preferredUnit, equipment, "down");
    }

    appendReason(
      `Current weekly muscle workload is high (${input.muscleCurrentWeekSets ?? 0} effective sets, target ${input.muscleTargetMinSets ?? goalConfig.defaultWorkingSets}-${input.muscleTargetMaxSets ?? goalConfig.defaultWorkingSets + 2}). Reduced volume for recovery.`
    );

    if (workingSets < previousWorkingSets) {
      appendReason(`Working sets adjusted from ${previousWorkingSets} to ${workingSets}.`);
    }
  } else if (input.muscleFatigueStatus === "LOW" && latestWorkout && failureStreak === 0) {
    const previousWorkingSets = workingSets;
    const maxSets = goalConfig.defaultWorkingSets + 2;
    workingSets = Math.min(maxSets, workingSets + 1);

    if (workingSets > previousWorkingSets) {
      appendReason("Weekly muscle workload is low, adding one working set for productive volume.");
    }
  }

  const sets: SuggestedWorkoutSet[] = [];

  if (isTimedExercise(exerciseType)) {
    const timedDuration = goal === "ENDURANCE" ? 45 : 30;

    for (let index = 0; index < workingSets; index += 1) {
      sets.push(createTimedSet(index, timedDuration, reason));
    }

    return {
      exerciseId: input.exerciseId,
      goal,
      workingWeight: null,
      workingReps,
      workingSets,
      unit: preferredUnit,
      successStreak,
      failureStreak,
      reason,
      sets
    };
  }

  if (isBodyweightExercise(equipment, exerciseType)) {
    for (let index = 0; index < workingSets; index += 1) {
      sets.push(createBodyweightSet(index, workingReps, reason));
    }

    return {
      exerciseId: input.exerciseId,
      goal,
      workingWeight: null,
      workingReps,
      workingSets,
      unit: preferredUnit,
      successStreak,
      failureStreak,
      reason,
      sets
    };
  }

  const safeWorkingWeight = workingWeight ?? roundToAvailableIncrement(10, preferredUnit, equipment);

  if (includeWarmupSets) {
    sets.push(...buildWarmupSets(safeWorkingWeight, preferredUnit, equipment, reason));
  }

  const initialSetIndex = sets.length;
  for (let setOffset = 0; setOffset < workingSets; setOffset += 1) {
    sets.push(
      createWeightedSet(initialSetIndex + setOffset, safeWorkingWeight, workingReps, preferredUnit, PrismaWorkoutSetType.NORMAL, reason)
    );
  }

  return {
    exerciseId: input.exerciseId,
    goal,
    workingWeight: safeWorkingWeight,
    workingReps,
    workingSets,
    unit: preferredUnit,
    successStreak,
    failureStreak,
    reason,
    sets
  };
}
