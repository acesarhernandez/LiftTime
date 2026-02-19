"use server";

import { z } from "zod";

import { prisma } from "@/shared/lib/prisma";
import { actionClient } from "@/shared/api/safe-actions";

const getWorkoutSessionsSchema = z.object({
  userId: z.string().optional(),
});

function buildLegacySetShape(set: {
  reps: number | null;
  weight: unknown;
  weightUnit: string | null;
  durationSec: number | null;
  rir: number | null;
  painLevel: string | null;
}) {
  const types: string[] = [];
  const valuesInt: number[] = [];
  const valuesSec: number[] = [];
  const units: string[] = [];

  if (set.weight !== null && set.weight !== undefined) {
    types.push("WEIGHT");
    valuesInt.push(Number(set.weight));
    units.push(set.weightUnit ?? "lbs");
  }

  if (set.reps !== null) {
    types.push("REPS");
    valuesInt.push(set.reps);
  }

  if (set.durationSec !== null) {
    types.push("TIME");
    valuesSec.push(set.durationSec);
  }

  if (types.length === 0) {
    types.push("NA");
  }

  return {
    types,
    valuesInt: valuesInt.length > 0 ? valuesInt : undefined,
    valuesSec: valuesSec.length > 0 ? valuesSec : undefined,
    units: units.length > 0 ? units : undefined,
    rir: set.rir,
    painLevel: set.painLevel,
  };
}

export const getWorkoutSessionsAction = actionClient.schema(getWorkoutSessionsSchema).action(async ({ parsedInput }) => {
  try {
    const { userId } = parsedInput;

    if (!userId) {
      return { serverError: "User ID is required" };
    }

    const sessions = await prisma.workoutSession.findMany({
      where: { userId },
      include: {
        exercises: {
          include: {
            exercise: {
              include: {
                attributes: {
                  include: {
                    attributeName: true,
                    attributeValue: true,
                  },
                },
              },
            },
            sets: true,
          },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    const serializedSessions = sessions.map((session) => ({
      ...session,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
      exercises: session.exercises.map((sessionExercise) => ({
        ...sessionExercise,
        sets: sessionExercise.sets.map((set) => {
          const legacyShape = buildLegacySetShape(set);
          const weight = set.weight !== null ? Number(set.weight) : null;

          return {
            ...set,
            ...legacyShape,
            weight,
          };
        }),
      })),
    }));

    return { sessions: serializedSessions };
  } catch (error) {
    console.error("Error fetching workout sessions:", error);
    return { serverError: "Failed to fetch workout sessions" };
  }
});
