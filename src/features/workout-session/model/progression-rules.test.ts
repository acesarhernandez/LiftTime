import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ExerciseAttributeNameEnum, ExerciseAttributeValueEnum, PainLevel, WeightUnit, WorkoutSetType as PrismaWorkoutSetType } from "@prisma/client";

import { ExerciseAttribute } from "@/entities/exercise/types/exercise.types";

import { buildExerciseRecommendation, roundToAvailableIncrement } from "./progression-rules";

function createAttribute(name: ExerciseAttributeNameEnum, value: ExerciseAttributeValueEnum): ExerciseAttribute {
  return {
    id: `${name}-${value}`,
    exerciseId: "exercise-1",
    attributeNameId: `${name}-id`,
    attributeValueId: `${value}-id`,
    attributeName: name,
    attributeValue: value
  };
}

function createHistoricalSet(params: {
  workoutSessionId: string;
  startedAt: string;
  setIndex: number;
  reps: number;
  weight: number;
  weightUnit?: WeightUnit;
  rir?: number;
  painLevel?: PainLevel;
}): {
  workoutSessionId: string;
  startedAt: Date;
  setIndex: number;
  type: PrismaWorkoutSetType;
  reps: number;
  weight: number;
  weightUnit: WeightUnit;
  durationSec: null;
  rir?: number;
  painLevel?: PainLevel;
} {
  return {
    workoutSessionId: params.workoutSessionId,
    startedAt: new Date(params.startedAt),
    setIndex: params.setIndex,
    type: PrismaWorkoutSetType.NORMAL,
    reps: params.reps,
    weight: params.weight,
    weightUnit: params.weightUnit ?? WeightUnit.kg,
    durationSec: null,
    rir: params.rir,
    painLevel: params.painLevel
  };
}

describe("roundToAvailableIncrement", () => {
  it("rounds barbell weights to available plate jumps", () => {
    const rounded = roundToAvailableIncrement(66, WeightUnit.kg, ExerciseAttributeValueEnum.BARBELL);

    assert.equal(rounded, 65);
  });

  it("rounds dumbbell weights to smaller jumps", () => {
    const rounded = roundToAvailableIncrement(10.6, WeightUnit.kg, ExerciseAttributeValueEnum.DUMBBELL);

    assert.equal(rounded, 11);
  });
});

describe("buildExerciseRecommendation", () => {
  it("uses no-history fallback, with warmups and working sets", () => {
    const recommendation = buildExerciseRecommendation({
      exerciseId: "exercise-1",
      attributes: [
        createAttribute(ExerciseAttributeNameEnum.PRIMARY_MUSCLE, ExerciseAttributeValueEnum.CHEST),
        createAttribute(ExerciseAttributeNameEnum.EQUIPMENT, ExerciseAttributeValueEnum.BARBELL),
        createAttribute(ExerciseAttributeNameEnum.TYPE, ExerciseAttributeValueEnum.STRENGTH)
      ],
      recentSets: [],
      goal: "HYPERTROPHY",
      includeWarmupSets: true
    });

    assert.equal(recommendation.goal, "HYPERTROPHY");
    assert.equal(recommendation.sets.length, 5);
    assert.equal(recommendation.sets[0].type, PrismaWorkoutSetType.WARMUP);
    assert.equal(recommendation.sets[1].type, PrismaWorkoutSetType.WARMUP);
    assert.equal(recommendation.sets[2].type, PrismaWorkoutSetType.NORMAL);
    assert.equal(recommendation.sets[2].types.includes("WEIGHT"), true);
    assert.equal(recommendation.sets[2].types.includes("REPS"), true);
  });

  it("increases load after two successful workouts", () => {
    const recentSets = [
      createHistoricalSet({ workoutSessionId: "w1", startedAt: "2026-02-18T10:00:00.000Z", setIndex: 0, reps: 12, weight: 60 }),
      createHistoricalSet({ workoutSessionId: "w1", startedAt: "2026-02-18T10:00:00.000Z", setIndex: 1, reps: 12, weight: 60 }),
      createHistoricalSet({ workoutSessionId: "w2", startedAt: "2026-02-12T10:00:00.000Z", setIndex: 0, reps: 12, weight: 60 }),
      createHistoricalSet({ workoutSessionId: "w2", startedAt: "2026-02-12T10:00:00.000Z", setIndex: 1, reps: 12, weight: 60 })
    ];

    const recommendation = buildExerciseRecommendation({
      exerciseId: "exercise-1",
      attributes: [
        createAttribute(ExerciseAttributeNameEnum.PRIMARY_MUSCLE, ExerciseAttributeValueEnum.BACK),
        createAttribute(ExerciseAttributeNameEnum.EQUIPMENT, ExerciseAttributeValueEnum.BARBELL),
        createAttribute(ExerciseAttributeNameEnum.TYPE, ExerciseAttributeValueEnum.STRENGTH)
      ],
      recentSets,
      goal: "HYPERTROPHY",
      includeWarmupSets: false,
      successStreakThreshold: 2
    });

    assert.equal(recommendation.successStreak, 2);
    assert.equal(recommendation.workingWeight, 135);
    assert.equal(recommendation.workingReps, 8);
  });

  it("deloads after two failed workouts", () => {
    const recentSets = [
      createHistoricalSet({ workoutSessionId: "w1", startedAt: "2026-02-18T10:00:00.000Z", setIndex: 0, reps: 6, weight: 60 }),
      createHistoricalSet({ workoutSessionId: "w1", startedAt: "2026-02-18T10:00:00.000Z", setIndex: 1, reps: 6, weight: 60 }),
      createHistoricalSet({ workoutSessionId: "w2", startedAt: "2026-02-12T10:00:00.000Z", setIndex: 0, reps: 7, weight: 60 }),
      createHistoricalSet({ workoutSessionId: "w2", startedAt: "2026-02-12T10:00:00.000Z", setIndex: 1, reps: 7, weight: 60 })
    ];

    const recommendation = buildExerciseRecommendation({
      exerciseId: "exercise-1",
      attributes: [
        createAttribute(ExerciseAttributeNameEnum.PRIMARY_MUSCLE, ExerciseAttributeValueEnum.BACK),
        createAttribute(ExerciseAttributeNameEnum.EQUIPMENT, ExerciseAttributeValueEnum.BARBELL),
        createAttribute(ExerciseAttributeNameEnum.TYPE, ExerciseAttributeValueEnum.STRENGTH)
      ],
      recentSets,
      goal: "HYPERTROPHY",
      includeWarmupSets: false,
      successStreakThreshold: 2
    });

    assert.equal(recommendation.failureStreak, 2);
    assert.equal(recommendation.workingWeight, 125);
    assert.equal(recommendation.workingReps, 8);
  });

  it("returns bodyweight recommendations for body-only movements", () => {
    const recommendation = buildExerciseRecommendation({
      exerciseId: "exercise-1",
      attributes: [
        createAttribute(ExerciseAttributeNameEnum.PRIMARY_MUSCLE, ExerciseAttributeValueEnum.CHEST),
        createAttribute(ExerciseAttributeNameEnum.EQUIPMENT, ExerciseAttributeValueEnum.BODY_ONLY),
        createAttribute(ExerciseAttributeNameEnum.TYPE, ExerciseAttributeValueEnum.BODYWEIGHT)
      ],
      recentSets: [],
      goal: "HYPERTROPHY"
    });

    assert.equal(recommendation.workingWeight, null);
    assert.equal(recommendation.sets.every((set) => set.types[0] === "REPS"), true);
  });

  it("reduces working sets when weekly muscle fatigue is high", () => {
    const recentSets = [
      createHistoricalSet({ workoutSessionId: "w1", startedAt: "2026-02-18T10:00:00.000Z", setIndex: 0, reps: 10, weight: 60 }),
      createHistoricalSet({ workoutSessionId: "w1", startedAt: "2026-02-18T10:00:00.000Z", setIndex: 1, reps: 10, weight: 60 })
    ];

    const recommendation = buildExerciseRecommendation({
      exerciseId: "exercise-1",
      attributes: [
        createAttribute(ExerciseAttributeNameEnum.PRIMARY_MUSCLE, ExerciseAttributeValueEnum.BACK),
        createAttribute(ExerciseAttributeNameEnum.EQUIPMENT, ExerciseAttributeValueEnum.BARBELL),
        createAttribute(ExerciseAttributeNameEnum.TYPE, ExerciseAttributeValueEnum.STRENGTH)
      ],
      recentSets,
      goal: "HYPERTROPHY",
      includeWarmupSets: false,
      muscleFatigueStatus: "HIGH",
      muscleCurrentWeekSets: 24,
      muscleTargetMinSets: 10,
      muscleTargetMaxSets: 20
    });

    assert.equal(recommendation.workingSets, 2);
    assert.equal(recommendation.sets.length, 2);
    assert.equal(recommendation.reason.includes("workload is high"), true);
  });

  it("adds a working set when weekly muscle fatigue is low and trend is stable", () => {
    const recentSets = [
      createHistoricalSet({ workoutSessionId: "w1", startedAt: "2026-02-18T10:00:00.000Z", setIndex: 0, reps: 10, weight: 60 }),
      createHistoricalSet({ workoutSessionId: "w1", startedAt: "2026-02-18T10:00:00.000Z", setIndex: 1, reps: 10, weight: 60 })
    ];

    const recommendation = buildExerciseRecommendation({
      exerciseId: "exercise-1",
      attributes: [
        createAttribute(ExerciseAttributeNameEnum.PRIMARY_MUSCLE, ExerciseAttributeValueEnum.BACK),
        createAttribute(ExerciseAttributeNameEnum.EQUIPMENT, ExerciseAttributeValueEnum.BARBELL),
        createAttribute(ExerciseAttributeNameEnum.TYPE, ExerciseAttributeValueEnum.STRENGTH)
      ],
      recentSets,
      goal: "HYPERTROPHY",
      includeWarmupSets: false,
      muscleFatigueStatus: "LOW"
    });

    assert.equal(recommendation.workingSets, 4);
    assert.equal(recommendation.sets.length, 4);
  });

  it("switches to conservative recommendations when pain was reported", () => {
    const recentSets = [
      createHistoricalSet({
        workoutSessionId: "w1",
        startedAt: "2026-02-18T10:00:00.000Z",
        setIndex: 0,
        reps: 10,
        weight: 60,
        painLevel: PainLevel.MODERATE
      }),
      createHistoricalSet({
        workoutSessionId: "w1",
        startedAt: "2026-02-18T10:00:00.000Z",
        setIndex: 1,
        reps: 10,
        weight: 60,
        painLevel: PainLevel.MODERATE
      })
    ];

    const recommendation = buildExerciseRecommendation({
      exerciseId: "exercise-1",
      attributes: [
        createAttribute(ExerciseAttributeNameEnum.PRIMARY_MUSCLE, ExerciseAttributeValueEnum.BACK),
        createAttribute(ExerciseAttributeNameEnum.EQUIPMENT, ExerciseAttributeValueEnum.BARBELL),
        createAttribute(ExerciseAttributeNameEnum.TYPE, ExerciseAttributeValueEnum.STRENGTH)
      ],
      recentSets,
      goal: "HYPERTROPHY",
      includeWarmupSets: false
    });

    assert.equal(recommendation.workingSets, 2);
    assert.equal(recommendation.reason.includes("Pain/discomfort"), true);
  });
});
