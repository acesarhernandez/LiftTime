"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { ExerciseAttributeNameEnum, ExerciseAttributeValueEnum, WeightUnit } from "@prisma/client";

import { prisma } from "@/shared/lib/prisma";
import { actionClient } from "@/shared/api/safe-actions";
import { getMuscleProgressByUser } from "@/features/workout-session/model/workout-session-read-model";
import { buildExerciseRecommendation } from "@/features/workout-session/model/progression-rules";
import { auth } from "@/features/auth/lib/better-auth";

import type { HistoricalSet, ProgressionGoal } from "@/features/workout-session/model/progression-rules";

const getWorkoutRecommendationSchema = z.object({
  userId: z.string(),
  exerciseIds: z.array(z.string()).min(1),
  fallbackMuscles: z.array(z.nativeEnum(ExerciseAttributeValueEnum)).optional(),
  goal: z.enum(["STRENGTH", "HYPERTROPHY", "ENDURANCE"]).optional(),
  preferredUnit: z.nativeEnum(WeightUnit).optional(),
  includeWarmupSets: z.boolean().optional(),
  analysisWorkoutCount: z.number().int().min(1).max(5).optional(),
  successStreakThreshold: z.number().int().min(1).max(4).optional()
});

export const getWorkoutRecommendationAction = actionClient.schema(getWorkoutRecommendationSchema).action(async ({ parsedInput }) => {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session?.user?.id || session.user.id !== parsedInput.userId) {
    return { serverError: "Unauthorized" };
  }

  const goal = parsedInput.goal ?? "HYPERTROPHY";
  const preferredUnit = parsedInput.preferredUnit ?? WeightUnit.lbs;

  try {
    const [exercises, historicalSets, muscleProgress] = await Promise.all([
      prisma.exercise.findMany({
        where: {
          id: { in: parsedInput.exerciseIds }
        },
        include: {
          attributes: {
            include: {
              attributeName: true,
              attributeValue: true
            }
          }
        }
      }),
      prisma.workoutSet.findMany({
        where: {
          completed: true,
          workoutSessionExercise: {
            exerciseId: { in: parsedInput.exerciseIds },
            workoutSession: {
              userId: parsedInput.userId,
              endedAt: {
                not: null
              }
            }
          }
        },
        select: {
          setIndex: true,
          type: true,
          reps: true,
          weight: true,
          weightUnit: true,
          durationSec: true,
          workoutSessionExercise: {
            select: {
              exerciseId: true,
              workoutSessionId: true,
              workoutSession: {
                select: {
                  startedAt: true
                }
              }
            }
          }
        },
        orderBy: [
          {
            workoutSessionExercise: {
              workoutSession: {
                startedAt: "desc"
              }
            }
          },
          {
            setIndex: "asc"
          }
        ]
      }),
      getMuscleProgressByUser(parsedInput.userId, {
        goal: goal as ProgressionGoal,
        weeks: 1,
        targetWeightUnit: preferredUnit
      })
    ]);

    const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));

    const setsByExerciseId = new Map<string, HistoricalSet[]>();
    const muscleProgressByMuscle = new Map(muscleProgress.map((entry) => [entry.muscle, entry]));

    historicalSets.forEach((set) => {
      const exerciseId = set.workoutSessionExercise.exerciseId;
      const existing = setsByExerciseId.get(exerciseId) ?? [];

      existing.push({
        workoutSessionId: set.workoutSessionExercise.workoutSessionId,
        startedAt: set.workoutSessionExercise.workoutSession.startedAt,
        setIndex: set.setIndex,
        type: set.type,
        reps: set.reps,
        weight: set.weight !== null ? Number(set.weight) : null,
        weightUnit: set.weightUnit,
        durationSec: set.durationSec
      });

      setsByExerciseId.set(exerciseId, existing);
    });

    const getPrimaryMuscle = (exercise: (typeof exercises)[number]): ExerciseAttributeValueEnum | null => {
      const primaryAttribute = exercise.attributes.find(
        (attribute) => attribute.attributeName.name === ExerciseAttributeNameEnum.PRIMARY_MUSCLE
      );
      return primaryAttribute?.attributeValue.value ?? null;
    };

    const fallbackPrimaryMuscle = parsedInput.fallbackMuscles?.[0] ?? null;

    const recommendationsByExerciseId = parsedInput.exerciseIds.reduce<Record<string, ReturnType<typeof buildExerciseRecommendation>["sets"]>>(
      (accumulator, exerciseId) => {
        const exercise = exerciseById.get(exerciseId);

        if (!exercise) {
          return accumulator;
        }

        const primaryMuscle = getPrimaryMuscle(exercise) ?? fallbackPrimaryMuscle ?? null;
        const muscleContext = primaryMuscle ? muscleProgressByMuscle.get(primaryMuscle) : undefined;

        const recommendation = buildExerciseRecommendation({
          exerciseId,
          attributes: exercise.attributes.map((attribute) => ({
            id: attribute.id,
            exerciseId: attribute.exerciseId,
            attributeNameId: attribute.attributeNameId,
            attributeValueId: attribute.attributeValueId,
            attributeName: attribute.attributeName.name,
            attributeValue: attribute.attributeValue.value
          })),
          recentSets: setsByExerciseId.get(exerciseId) ?? [],
          goal: goal as ProgressionGoal,
          preferredUnit,
          includeWarmupSets: parsedInput.includeWarmupSets ?? true,
          analysisWorkoutCount: parsedInput.analysisWorkoutCount ?? 3,
          successStreakThreshold: parsedInput.successStreakThreshold ?? 2,
          fallbackPrimaryMuscle,
          muscleFatigueStatus: muscleContext?.fatigueStatus,
          muscleCurrentWeekSets: muscleContext?.currentWeekEffectiveSets,
          muscleTargetMinSets: muscleContext?.targetMinSets,
          muscleTargetMaxSets: muscleContext?.targetMaxSets
        });

        accumulator[exerciseId] = recommendation.sets;
        return accumulator;
      },
      {}
    );

    return {
      recommendationsByExerciseId,
      meta: {
        goal,
        preferredUnit,
        analysisWorkoutCount: parsedInput.analysisWorkoutCount ?? 3,
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error("Error generating workout recommendations:", error);
    return { serverError: "Failed to generate workout recommendations" };
  }
});
