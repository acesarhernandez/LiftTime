import { ExerciseAttributeValueEnum, type Prisma, WorkoutSetType, WeightUnit } from "@prisma/client";

import { ERROR_MESSAGES } from "@/shared/constants/errors";

interface LegacyWorkoutSetInput {
  id: string;
  setIndex: number;
  type?: WorkoutSetType | string;
  types: string[];
  valuesInt?: number[];
  valuesSec?: number[];
  units?: string[];
  completed: boolean;
}

interface NormalizedWorkoutSetInput {
  id: string;
  setIndex: number;
  type?: WorkoutSetType | string;
  reps?: number | null;
  weight?: number | string | null;
  weightUnit?: WeightUnit | string | null;
  durationSec?: number | null;
  completed: boolean;
}

export type WorkoutSetSyncInput = LegacyWorkoutSetInput | NormalizedWorkoutSetInput;

export interface WorkoutSessionExerciseSyncInput {
  id: string;
  exerciseId?: string;
  order: number;
  sets: WorkoutSetSyncInput[];
}

export interface WorkoutSessionSyncInput {
  id: string;
  userId: string;
  startedAt: string;
  endedAt?: string;
  exercises: WorkoutSessionExerciseSyncInput[];
  status: "active" | "completed" | "synced";
  muscles: ExerciseAttributeValueEnum[];
  rating?: number | null;
  ratingComment?: string | null;
}

interface WorkoutSessionPrismaSyncClient {
  user: {
    findUnique: (args: { where: { id: string }; select: { id: true } }) => Promise<{ id: string } | null>;
  };
  exercise: {
    findMany: (args: { where: { id: { in: string[] } }; select: { id: true } }) => Promise<Array<{ id: string }>>;
  };
  workoutSession: {
    upsert: (args: Prisma.WorkoutSessionUpsertArgs) => Promise<{ id: string }>;
  };
}

type SyncWorkoutSessionResult = { data: { id: string } } | { serverError: string };

const validWorkoutSetTypes = new Set(Object.values(WorkoutSetType));
const validWeightUnits = new Set(Object.values(WeightUnit));

function normalizeWorkoutSetType(type: unknown): WorkoutSetType {
  if (typeof type === "string" && validWorkoutSetTypes.has(type as WorkoutSetType)) {
    return type as WorkoutSetType;
  }

  return WorkoutSetType.NORMAL;
}

function parseNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsedValue = Number(value);
    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return null;
}

function normalizeWeightUnit(weightUnit: unknown, weight: number | null): WeightUnit | null {
  if (typeof weightUnit === "string" && validWeightUnits.has(weightUnit as WeightUnit)) {
    return weightUnit as WeightUnit;
  }

  if (weight !== null) {
    return WeightUnit.lbs;
  }

  return null;
}

function isNormalizedSetShape(set: WorkoutSetSyncInput): set is NormalizedWorkoutSetInput {
  return "reps" in set || "weight" in set || "durationSec" in set || "type" in set;
}

export function normalizeSet(set: WorkoutSetSyncInput): Prisma.WorkoutSetCreateWithoutWorkoutSessionExerciseInput {
  if (isNormalizedSetShape(set)) {
    const reps = parseNullableNumber(set.reps);
    const weight = parseNullableNumber(set.weight);
    const durationSec = parseNullableNumber(set.durationSec);

    return {
      setIndex: set.setIndex,
      type: normalizeWorkoutSetType(set.type),
      reps,
      weight: weight !== null ? String(weight) : null,
      weightUnit: normalizeWeightUnit(set.weightUnit, weight),
      durationSec,
      completed: set.completed ?? false,
    };
  }

  const types = set.types ?? [];
  const valuesInt = set.valuesInt ?? [];
  const valuesSec = set.valuesSec ?? [];
  const units = set.units ?? [];

  const repsIndex = types.indexOf("REPS");
  const weightIndex = types.indexOf("WEIGHT");
  const timeIndex = types.indexOf("TIME");

  const reps = repsIndex >= 0 ? parseNullableNumber(valuesInt[repsIndex]) : null;
  const weight = weightIndex >= 0 ? parseNullableNumber(valuesInt[weightIndex]) : null;
  const durationSec = timeIndex >= 0 ? parseNullableNumber(valuesSec[timeIndex] ?? valuesSec[0]) : null;
  const weightUnit = weightIndex >= 0 ? normalizeWeightUnit(units[weightIndex], weight) : null;

  return {
    setIndex: set.setIndex,
    type: normalizeWorkoutSetType(set.type),
    reps,
    weight: weight !== null ? String(weight) : null,
    weightUnit,
    durationSec,
    completed: set.completed ?? false,
  };
}

export function resolveRealExerciseIds(exercises: WorkoutSessionExerciseSyncInput[]): string[] {
  return exercises.map((exercise) => exercise.exerciseId ?? exercise.id);
}

function buildExerciseCreateInput(exercises: WorkoutSessionExerciseSyncInput[]) {
  return exercises.map((exercise) => {
    const realExerciseId = exercise.exerciseId ?? exercise.id;

    return {
      order: exercise.order,
      exercise: { connect: { id: realExerciseId } },
      sets: {
        create: exercise.sets.map((set) => normalizeSet(set)),
      },
    };
  });
}

export function buildWorkoutSessionUpsertArgs(session: WorkoutSessionSyncInput): Prisma.WorkoutSessionUpsertArgs {
  const exerciseCreateInput = buildExerciseCreateInput(session.exercises);
  const { status: _status, ...sessionData } = session;

  return {
    where: { id: session.id },
    create: {
      ...sessionData,
      muscles: session.muscles,
      rating: session.rating,
      ratingComment: session.ratingComment,
      exercises: {
        create: exerciseCreateInput,
      },
    },
    update: {
      muscles: session.muscles,
      rating: session.rating,
      ratingComment: session.ratingComment,
      exercises: {
        deleteMany: {},
        create: exerciseCreateInput,
      },
    },
  };
}

export async function syncWorkoutSessionWithPrisma(
  prismaClient: WorkoutSessionPrismaSyncClient,
  session: WorkoutSessionSyncInput,
): Promise<SyncWorkoutSessionResult> {
  const userExists = await prismaClient.user.findUnique({
    where: { id: session.userId },
    select: { id: true },
  });

  if (!userExists) {
    return { serverError: ERROR_MESSAGES.USER_NOT_FOUND };
  }

  const realExerciseIds = resolveRealExerciseIds(session.exercises);
  const existingExercises = await prismaClient.exercise.findMany({
    where: { id: { in: realExerciseIds } },
    select: { id: true },
  });

  const existingExerciseIds = new Set(existingExercises.map((exercise) => exercise.id));
  const missingExercises = realExerciseIds.filter((id) => !existingExerciseIds.has(id));

  if (missingExercises.length > 0) {
    return { serverError: `Exercises not found: ${missingExercises.join(", ")}` };
  }

  const result = await prismaClient.workoutSession.upsert(buildWorkoutSessionUpsertArgs(session));
  return { data: result };
}
