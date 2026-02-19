import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ExerciseAttributeNameEnum, ExerciseAttributeValueEnum, WeightUnit, WorkoutSetType } from "@prisma/client";

import { aggregateMuscleProgress, aggregateWeeklyVolume, getLastPerformanceByExercise, getWeeklyVolumeByUser } from "./workout-session-read-model";

describe("aggregateWeeklyVolume", () => {
  it("aggregates weekly volume using normalized reps/weight/time fields", () => {
    const rows = [
      {
        reps: 10,
        weight: 100 as never,
        weightUnit: WeightUnit.kg,
        durationSec: null,
        workoutSessionExercise: {
          workoutSession: {
            startedAt: new Date("2026-02-16T10:00:00.000Z"),
          },
        },
      },
      {
        reps: 10,
        weight: 100 as never,
        weightUnit: WeightUnit.lbs,
        durationSec: null,
        workoutSessionExercise: {
          workoutSession: {
            startedAt: new Date("2026-02-18T10:00:00.000Z"),
          },
        },
      },
      {
        reps: 12,
        weight: null,
        weightUnit: null,
        durationSec: null,
        workoutSessionExercise: {
          workoutSession: {
            startedAt: new Date("2026-02-24T10:00:00.000Z"),
          },
        },
      },
      {
        reps: null,
        weight: null,
        weightUnit: null,
        durationSec: 30,
        workoutSessionExercise: {
          workoutSession: {
            startedAt: new Date("2026-02-24T10:00:00.000Z"),
          },
        },
      },
    ];

    const result = aggregateWeeklyVolume(rows, WeightUnit.kg);

    assert.deepEqual(result, [
      {
        weekStart: "2026-02-16",
        totalVolume: 1453.59,
        setsCount: 2,
      },
      {
        weekStart: "2026-02-23",
        totalVolume: 42,
        setsCount: 2,
      },
    ]);
  });
});

describe("getLastPerformanceByExercise", () => {
  it("returns last completed set metrics from the latest session", async () => {
    const prismaMock = {
      workoutSessionExercise: {
        findFirst: async () => {
          return {
            workoutSessionId: "session-1",
            exerciseId: "exercise-1",
            workoutSession: { startedAt: new Date("2026-02-18T10:00:00.000Z") },
            sets: [
              {
                id: "set-2",
                setIndex: 2,
                type: "NORMAL",
                reps: null,
                weight: null,
                weightUnit: null,
                durationSec: null,
              },
              {
                id: "set-1",
                setIndex: 1,
                type: "AMRAP",
                reps: 8,
                weight: 80 as never,
                weightUnit: WeightUnit.kg,
                durationSec: null,
              },
            ],
          };
        },
      },
      workoutSet: {
        findMany: async () => [],
      },
    };

    const result = await getLastPerformanceByExercise("user-1", "exercise-1", prismaMock);

    assert.equal(result?.sessionId, "session-1");
    assert.equal(result?.exerciseId, "exercise-1");
    assert.equal(result?.setId, "set-1");
    assert.equal(result?.type, "AMRAP");
    assert.equal(result?.reps, 8);
    assert.equal(result?.weight, 80);
    assert.equal(result?.weightUnit, WeightUnit.kg);
  });

  it("returns null when no performance exists", async () => {
    const prismaMock = {
      workoutSessionExercise: {
        findFirst: async () => null,
      },
      workoutSet: {
        findMany: async () => [],
      },
    };

    const result = await getLastPerformanceByExercise("user-1", "exercise-1", prismaMock);

    assert.equal(result, null);
  });
});

describe("getWeeklyVolumeByUser", () => {
  it("queries completed sets and returns weekly aggregates", async () => {
    let capturedUserId = "";

    const prismaMock = {
      workoutSessionExercise: {
        findFirst: async () => null,
      },
      workoutSet: {
        findMany: async (args: { where: { workoutSessionExercise: { workoutSession: { userId: string } } } }) => {
          capturedUserId = args.where.workoutSessionExercise.workoutSession.userId;

          return [
            {
              setIndex: 0,
              reps: 10,
              weight: 90 as never,
              weightUnit: WeightUnit.kg,
              durationSec: null,
              workoutSessionExercise: {
                workoutSession: {
                  startedAt: new Date("2026-02-17T10:00:00.000Z"),
                },
              },
            },
          ];
        },
      },
    };

    const result = await getWeeklyVolumeByUser("user-42", 8, WeightUnit.kg, prismaMock);

    assert.equal(capturedUserId, "user-42");
    assert.deepEqual(result, [
      {
        weekStart: "2026-02-16",
        totalVolume: 900,
        setsCount: 1,
      },
    ]);
  });
});

describe("aggregateMuscleProgress", () => {
  it("tracks effective sets with primary and secondary muscle credits", () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const rows = [
      {
        type: WorkoutSetType.NORMAL,
        reps: 10,
        weight: 100 as never,
        weightUnit: WeightUnit.lbs,
        durationSec: null,
        workoutSessionExercise: {
          exerciseId: "bench-press",
          workoutSession: {
            startedAt: yesterday,
          },
          exercise: {
            id: "bench-press",
            name: "Barbell Bench Press",
            nameEn: "Barbell Bench Press",
            attributes: [
              {
                attributeName: { name: ExerciseAttributeNameEnum.PRIMARY_MUSCLE },
                attributeValue: { value: ExerciseAttributeValueEnum.CHEST },
              },
              {
                attributeName: { name: ExerciseAttributeNameEnum.SECONDARY_MUSCLE },
                attributeValue: { value: ExerciseAttributeValueEnum.TRICEPS },
              },
            ],
          },
        },
      },
      {
        type: WorkoutSetType.NORMAL,
        reps: 10,
        weight: 80 as never,
        weightUnit: WeightUnit.lbs,
        durationSec: null,
        workoutSessionExercise: {
          exerciseId: "push-up",
          workoutSession: {
            startedAt: today,
          },
          exercise: {
            id: "push-up",
            name: "Push Up",
            nameEn: "Push Up",
            attributes: [
              {
                attributeName: { name: ExerciseAttributeNameEnum.PRIMARY_MUSCLE },
                attributeValue: { value: ExerciseAttributeValueEnum.CHEST },
              },
            ],
          },
        },
      },
    ];

    const result = aggregateMuscleProgress(rows, "HYPERTROPHY", WeightUnit.lbs);
    const chest = result.find((muscle) => muscle.muscle === ExerciseAttributeValueEnum.CHEST);
    const triceps = result.find((muscle) => muscle.muscle === ExerciseAttributeValueEnum.TRICEPS);

    assert.equal(chest?.currentWeekEffectiveSets, 2);
    assert.equal(chest?.topExercises.length, 2);
    assert.equal(triceps?.currentWeekEffectiveSets, 0.5);
    assert.equal(triceps?.topExercises[0].exerciseId, "bench-press");
  });

  it("ignores warmup sets for fatigue and workload calculations", () => {
    const rows = [
      {
        type: WorkoutSetType.WARMUP,
        reps: 8,
        weight: 60 as never,
        weightUnit: WeightUnit.lbs,
        durationSec: null,
        workoutSessionExercise: {
          exerciseId: "bench-press",
          workoutSession: {
            startedAt: new Date(),
          },
          exercise: {
            id: "bench-press",
            name: "Barbell Bench Press",
            nameEn: "Barbell Bench Press",
            attributes: [
              {
                attributeName: { name: ExerciseAttributeNameEnum.PRIMARY_MUSCLE },
                attributeValue: { value: ExerciseAttributeValueEnum.CHEST },
              },
            ],
          },
        },
      },
    ];

    const result = aggregateMuscleProgress(rows, "HYPERTROPHY", WeightUnit.lbs);

    assert.equal(result.length, 0);
  });
});
