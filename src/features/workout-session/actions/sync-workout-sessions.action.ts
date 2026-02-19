"use server";

import { z } from "zod";
import { ExerciseAttributeValueEnum, PainLevel, WorkoutSetType, WeightUnit } from "@prisma/client";

import { workoutSessionStatuses } from "@/shared/lib/workout-session/types/workout-session";
import { prisma } from "@/shared/lib/prisma";
import { actionClient } from "@/shared/api/safe-actions";
import { syncWorkoutSessionWithPrisma } from "@/features/workout-session/lib/sync-workout-session";

/**
 * Accept legacy set shape from the client store:
 *   { types: ["REPS","WEIGHT"], valuesInt: [...], units: [...] }
 */
const legacyWorkoutSetSchema = z.object({
  id: z.string(),
  setIndex: z.number(),
  type: z.nativeEnum(WorkoutSetType).optional(),
  types: z.array(z.string()),
  valuesInt: z.array(z.number()).optional(),
  valuesSec: z.array(z.number()).optional(),
  units: z.array(z.string()).optional(),
  rir: z.number().int().min(0).max(10).optional().nullable(),
  painLevel: z.nativeEnum(PainLevel).optional().nullable(),
  completed: z.boolean(),
});

/**
 * Accept new normalized set shape:
 *   { type, reps, weight, weightUnit, durationSec }
 */
const newWorkoutSetSchema = z.object({
  id: z.string(),
  setIndex: z.number(),
  type: z.nativeEnum(WorkoutSetType).optional(),
  reps: z.number().int().optional().nullable(),
  weight: z.union([z.number(), z.string()]).optional().nullable(),
  weightUnit: z.nativeEnum(WeightUnit).optional().nullable(),
  durationSec: z.number().int().optional().nullable(),
  rir: z.number().int().min(0).max(10).optional().nullable(),
  painLevel: z.nativeEnum(PainLevel).optional().nullable(),
  completed: z.boolean(),
});

const workoutSetSchema = z.union([legacyWorkoutSetSchema, newWorkoutSetSchema]);

/**
 * IMPORTANT:
 * The client currently sends exercises where `id` is actually the Exercise.id.
 * Some future version might send `exerciseId` separately.
 *
 * So we accept BOTH:
 *   - id (always)
 *   - exerciseId (optional)
 */
const workoutSessionExerciseSchema = z.object({
  id: z.string(), // client sends Exercise.id here today
  exerciseId: z.string().optional(), // allow future / alternate shape
  order: z.number(),
  sets: z.array(workoutSetSchema),
});

const syncWorkoutSessionSchema = z.object({
  session: z.object({
    id: z.string(),
    userId: z.string(),
    startedAt: z.string(),
    endedAt: z.string().optional(),
    exercises: z.array(workoutSessionExerciseSchema),
    status: z.enum(workoutSessionStatuses),
    muscles: z.array(z.nativeEnum(ExerciseAttributeValueEnum)),
    rating: z.number().min(1).max(5).nullable().optional(),
    ratingComment: z.string().nullable().optional(),
  }),
});

export const syncWorkoutSessionAction = actionClient.schema(syncWorkoutSessionSchema).action(async ({ parsedInput }) => {
  try {
    const { session } = parsedInput;

    const result = await syncWorkoutSessionWithPrisma(prisma, session);

    if (result.serverError) {
      console.error("Failed to sync workout session:", result.serverError);
      return { serverError: result.serverError };
    }

    if (!result.data) {
      return { serverError: "Failed to sync workout session" };
    }

    console.log("✅ Workout session synced successfully:", result.data.id);
    return result;
  } catch (error) {
    console.error("❌ Error syncing workout session:", error);
    return { serverError: "Failed to sync workout session" };
  }
});
