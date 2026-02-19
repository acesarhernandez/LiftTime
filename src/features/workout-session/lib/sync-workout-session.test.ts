import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ExerciseAttributeValueEnum, WorkoutSetType, WeightUnit } from "@prisma/client";

import { ERROR_MESSAGES } from "@/shared/constants/errors";

import { buildWorkoutSessionUpsertArgs, normalizeSet, syncWorkoutSessionWithPrisma, type WorkoutSessionSyncInput } from "./sync-workout-session";

function createBaseSession(): WorkoutSessionSyncInput {
  return {
    id: "session-1",
    userId: "user-1",
    startedAt: "2026-02-18T10:00:00.000Z",
    endedAt: "2026-02-18T10:45:00.000Z",
    status: "completed",
    muscles: [ExerciseAttributeValueEnum.CHEST],
    rating: 5,
    ratingComment: "great workout",
    exercises: [
      {
        id: "exercise-client-id",
        exerciseId: "exercise-1",
        order: 0,
        sets: [],
      },
    ],
  };
}

function createPrismaMock({ userExists = true, existingExerciseIds = ["exercise-1"] }: { userExists?: boolean; existingExerciseIds?: string[] } = {}) {
  const upsertCalls: unknown[] = [];

  const prismaMock = {
    user: {
      findUnique: async () => (userExists ? { id: "user-1" } : null),
    },
    exercise: {
      findMany: async (args: { where: { id: { in: string[] } } }) => {
        const requestedExerciseIds = args.where.id.in;
        return requestedExerciseIds.filter((id) => existingExerciseIds.includes(id)).map((id) => ({ id }));
      },
    },
    workoutSession: {
      upsert: async (args: unknown) => {
        upsertCalls.push(args);
        return { id: "session-1" };
      },
    },
  };

  return { prismaMock, upsertCalls };
}

describe("normalizeSet", () => {
  it("maps normalized sets and defaults weight unit to lbs when missing", () => {
    const normalized = normalizeSet({
      id: "set-1",
      setIndex: 0,
      type: WorkoutSetType.AMRAP,
      reps: 10,
      weight: 100,
      completed: true,
    });

    assert.deepEqual(normalized, {
      setIndex: 0,
      type: WorkoutSetType.AMRAP,
      reps: 10,
      weight: "100",
      weightUnit: WeightUnit.lbs,
      durationSec: null,
      completed: true,
    });
  });

  it("maps legacy sets with reps and weight", () => {
    const normalized = normalizeSet({
      id: "set-1",
      setIndex: 0,
      types: ["WEIGHT", "REPS"],
      valuesInt: [60, 8],
      units: [],
      completed: true,
    });

    assert.deepEqual(normalized, {
      setIndex: 0,
      type: WorkoutSetType.NORMAL,
      reps: 8,
      weight: "60",
      weightUnit: WeightUnit.lbs,
      durationSec: null,
      completed: true,
    });
  });

  it("maps legacy time sets into durationSec", () => {
    const normalized = normalizeSet({
      id: "set-1",
      setIndex: 0,
      types: ["TIME"],
      valuesSec: [45],
      completed: true,
    });

    assert.deepEqual(normalized, {
      setIndex: 0,
      type: WorkoutSetType.NORMAL,
      reps: null,
      weight: null,
      weightUnit: null,
      durationSec: 45,
      completed: true,
    });
  });

  it("keeps valid prisma type from legacy shape", () => {
    const normalized = normalizeSet({
      id: "set-1",
      setIndex: 0,
      type: WorkoutSetType.WARMUP,
      types: ["WEIGHT", "REPS"],
      valuesInt: [40, 8],
      units: ["kg"],
      completed: false,
    });

    assert.equal(normalized.type, WorkoutSetType.WARMUP);
  });

  it("falls back to NORMAL when set type is not a valid prisma enum", () => {
    const normalized = normalizeSet({
      id: "set-1",
      setIndex: 0,
      type: "REPS",
      reps: 12,
      completed: false,
    });

    assert.equal(normalized.type, WorkoutSetType.NORMAL);
  });
});

describe("buildWorkoutSessionUpsertArgs", () => {
  it("builds nested exercise and set create input", () => {
    const session = createBaseSession();
    session.exercises[0].sets = [
      {
        id: "set-1",
        setIndex: 0,
        types: ["WEIGHT", "REPS"],
        valuesInt: [65, 7],
        completed: true,
      },
    ];

    const upsertArgs = buildWorkoutSessionUpsertArgs(session);
    const createdSets = (upsertArgs.create.exercises as { create: Array<{ sets: { create: unknown[] } }> }).create[0].sets.create;

    assert.equal(upsertArgs.where.id, "session-1");
    assert.equal((upsertArgs.update.exercises as { deleteMany: Record<string, never> }).deleteMany !== undefined, true);
    assert.deepEqual(createdSets[0], {
      setIndex: 0,
      type: WorkoutSetType.NORMAL,
      reps: 7,
      weight: "65",
      weightUnit: WeightUnit.lbs,
      durationSec: null,
      completed: true,
    });
  });
});

describe("syncWorkoutSessionWithPrisma", () => {
  it("returns USER_NOT_FOUND when user does not exist", async () => {
    const session = createBaseSession();
    const { prismaMock, upsertCalls } = createPrismaMock({ userExists: false });

    const result = await syncWorkoutSessionWithPrisma(prismaMock, session);

    assert.equal(result.serverError, ERROR_MESSAGES.USER_NOT_FOUND);
    assert.equal(upsertCalls.length, 0);
  });

  it("returns missing exercises error when exercise IDs are unknown", async () => {
    const session = createBaseSession();
    const { prismaMock, upsertCalls } = createPrismaMock({ existingExerciseIds: [] });

    const result = await syncWorkoutSessionWithPrisma(prismaMock, session);

    assert.equal(result.serverError, "Exercises not found: exercise-1");
    assert.equal(upsertCalls.length, 0);
  });

  it("upserts session data and is idempotent across repeated syncs", async () => {
    const session = createBaseSession();
    session.exercises[0].sets = [
      {
        id: "set-1",
        setIndex: 0,
        types: ["WEIGHT", "REPS"],
        valuesInt: [70, 6],
        completed: true,
      },
      {
        id: "set-2",
        setIndex: 1,
        type: "REPS",
        reps: 10,
        weight: 30,
        weightUnit: "unknown",
        completed: true,
      },
    ];

    const { prismaMock, upsertCalls } = createPrismaMock();

    const firstResult = await syncWorkoutSessionWithPrisma(prismaMock, session);
    const secondResult = await syncWorkoutSessionWithPrisma(prismaMock, session);

    assert.equal(firstResult.serverError, undefined);
    assert.equal(secondResult.serverError, undefined);
    assert.equal(firstResult.data?.id, "session-1");
    assert.equal(secondResult.data?.id, "session-1");
    assert.equal(upsertCalls.length, 2);
  });
});
