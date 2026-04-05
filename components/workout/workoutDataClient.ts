"use client";

import {
  deleteRows,
  fetchRows,
  fetchSingleRow,
  getAuthenticatedUser,
  insertRow,
  updateRows
} from "@/components/admin/supabaseClient";
import type { SetType } from "@/types/workout";

export interface AuthenticatedWorkoutUser {
  id: string;
  email: string;
}

export interface DbWorkoutSession {
  id: string;
  user_id: string;
  name: string | null;
  status: "active" | "completed" | "incomplete";
  started_at: string;
  ended_at: string | null;
}

export interface DbWorkoutExercise {
  id: string;
  session_id: string;
  exercise_id: string;
  order_index: number;
  superset_group_id: string | null;
  created_at: string;
}

export interface DbWorkoutSet {
  id: string;
  workout_exercise_id: string;
  set_number: number;
  set_type: SetType;
  weight_lbs: number | null;
  reps: number | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface DbExerciseCatalog {
  id: string;
  name: string;
  equipment: string[];
  muscle_groups: string[];
  instructions: string[];
  cues: string[];
  progressive_overload_notes: string | null;
}

export interface SessionExerciseBundle {
  workoutExercises: DbWorkoutExercise[];
  workoutSets: DbWorkoutSet[];
  exercisesById: Record<string, DbExerciseCatalog>;
}

export interface BootstrapSetInput {
  setNumber: number;
  setType: SetType;
  weightLbs: number | null;
  reps: number | null;
  completed?: boolean;
  completedAt?: string | null;
}

export interface BootstrapWorkoutExerciseInput {
  exerciseId: string;
  orderIndex: number;
  supersetGroupId?: string | null;
  sets: BootstrapSetInput[];
}

export interface BootstrapWorkoutParams {
  sessionId: string;
  exercises: BootstrapWorkoutExerciseInput[];
}

export interface LoadOrCreateSessionParams {
  userId: string;
  name: string | null;
  bootstrapExercises: BootstrapWorkoutExerciseInput[];
}

export interface LoadOrCreateSessionResult {
  session: DbWorkoutSession;
  workoutExercises: DbWorkoutExercise[];
  workoutSets: DbWorkoutSet[];
  exercisesById: Record<string, DbExerciseCatalog>;
  created: boolean;
}

export interface CompleteSetParams {
  workoutExerciseId: string;
  setId: string;
  setNumber: number;
  setType: SetType;
  weightLbs: number | null;
  reps: number | null;
  completedAt: string;
}

export interface AddSetParams {
  workoutExerciseId: string;
  weightLbs: number | null;
  reps: number | null;
  setType?: SetType;
}

export interface DeleteSetParams {
  workoutExerciseId: string;
  setId: string;
}

export interface ReorderWorkoutExercisesParams {
  sessionId: string;
  orderedWorkoutExerciseIds: string[];
}

export interface DeleteWorkoutExercisesParams {
  sessionId: string;
  workoutExerciseIds: string[];
}

const buildInFilter = (values: string[]): string | undefined => {
  if (values.length === 0) {
    return undefined;
  }

  return `in.(${values.join(",")})`;
};

const uniqueStrings = (values: string[]): string[] => {
  return [...new Set(values)];
};

const normalizeSessionOrderIndexes = async (sessionId: string): Promise<void> => {
  const rows = await fetchRows<Pick<DbWorkoutExercise, "id" | "order_index">>("workout_exercises", {
    select: "id,order_index",
    session_id: `eq.${sessionId}`,
    order: "order_index.asc"
  });

  for (let index = 0; index < rows.length; index += 1) {
    const expectedOrder = index + 1;
    if (rows[index].order_index === expectedOrder) {
      continue;
    }

    await updateRows<DbWorkoutExercise>(
      "workout_exercises",
      { id: `eq.${rows[index].id}`, session_id: `eq.${sessionId}` },
      { order_index: expectedOrder }
    );
  }
};

const normalizeSetNumbers = async (workoutExerciseId: string): Promise<void> => {
  const rows = await fetchRows<Pick<DbWorkoutSet, "id" | "set_number">>("workout_sets", {
    select: "id,set_number",
    workout_exercise_id: `eq.${workoutExerciseId}`,
    order: "set_number.asc"
  });

  for (let index = 0; index < rows.length; index += 1) {
    const expectedNumber = index + 1;
    if (rows[index].set_number === expectedNumber) {
      continue;
    }

    await updateRows<DbWorkoutSet>(
      "workout_sets",
      { id: `eq.${rows[index].id}`, workout_exercise_id: `eq.${workoutExerciseId}` },
      { set_number: expectedNumber }
    );
  }
};

export const requireAuthenticatedUser = async (): Promise<AuthenticatedWorkoutUser> => {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error("AUTH_REQUIRED");
  }

  return {
    id: user.id,
    email: user.email
  };
};

export const fetchActiveWorkoutSession = async (userId: string): Promise<DbWorkoutSession | null> => {
  return fetchSingleRow<DbWorkoutSession>("workout_sessions", {
    select: "*",
    user_id: `eq.${userId}`,
    status: "eq.active",
    order: "started_at.desc"
  });
};

export const fetchSessionExercisesWithSets = async (sessionId: string): Promise<SessionExerciseBundle> => {
  const workoutExercises = await fetchRows<DbWorkoutExercise>("workout_exercises", {
    select: "*",
    session_id: `eq.${sessionId}`,
    order: "order_index.asc"
  });

  if (workoutExercises.length === 0) {
    return {
      workoutExercises: [],
      workoutSets: [],
      exercisesById: {}
    };
  }

  const workoutExerciseIds = workoutExercises.map((exercise) => exercise.id);
  const workoutSets = await fetchRows<DbWorkoutSet>("workout_sets", {
    select: "*",
    workout_exercise_id: buildInFilter(workoutExerciseIds),
    order: "set_number.asc"
  });

  const exerciseIds = uniqueStrings(workoutExercises.map((exercise) => exercise.exercise_id));
  const exerciseCatalogRows = await fetchRows<DbExerciseCatalog>("exercises", {
    select: "id,name,equipment,muscle_groups,instructions,cues,progressive_overload_notes",
    id: buildInFilter(exerciseIds)
  });

  const exercisesById = exerciseCatalogRows.reduce<Record<string, DbExerciseCatalog>>((accumulator, row) => {
    accumulator[row.id] = row;
    return accumulator;
  }, {});

  return {
    workoutExercises,
    workoutSets,
    exercisesById
  };
};

export const createActiveWorkoutSession = async (
  userId: string,
  name: string | null
): Promise<DbWorkoutSession> => {
  return insertRow<DbWorkoutSession>("workout_sessions", {
    user_id: userId,
    name,
    status: "active"
  });
};

export const bootstrapWorkoutExercisesAndSets = async (
  params: BootstrapWorkoutParams
): Promise<{ workoutExercises: DbWorkoutExercise[]; workoutSets: DbWorkoutSet[] }> => {
  const sortedExercises = [...params.exercises].sort((left, right) => left.orderIndex - right.orderIndex);
  const createdExercises: DbWorkoutExercise[] = [];
  const createdSets: DbWorkoutSet[] = [];

  for (const exercise of sortedExercises) {
    const createdExercise = await insertRow<DbWorkoutExercise>("workout_exercises", {
      session_id: params.sessionId,
      exercise_id: exercise.exerciseId,
      order_index: exercise.orderIndex,
      superset_group_id: exercise.supersetGroupId ?? null
    });

    createdExercises.push(createdExercise);

    const sortedSets = [...exercise.sets].sort((left, right) => left.setNumber - right.setNumber);
    for (const set of sortedSets) {
      const completed = set.completed ?? false;
      const completedAt = completed ? (set.completedAt ?? new Date().toISOString()) : null;

      const createdSet = await insertRow<DbWorkoutSet>("workout_sets", {
        workout_exercise_id: createdExercise.id,
        set_number: set.setNumber,
        set_type: set.setType,
        weight_lbs: set.weightLbs,
        reps: set.reps,
        completed,
        completed_at: completedAt
      });

      createdSets.push(createdSet);
    }
  }

  return {
    workoutExercises: createdExercises,
    workoutSets: createdSets
  };
};

export const loadOrCreateActiveSession = async (
  params: LoadOrCreateSessionParams
): Promise<LoadOrCreateSessionResult> => {
  const existing = await fetchActiveWorkoutSession(params.userId);
  if (existing) {
    const related = await fetchSessionExercisesWithSets(existing.id);
    return {
      session: existing,
      ...related,
      created: false
    };
  }

  try {
    const createdSession = await createActiveWorkoutSession(params.userId, params.name);
    await bootstrapWorkoutExercisesAndSets({
      sessionId: createdSession.id,
      exercises: params.bootstrapExercises
    });

    const related = await fetchSessionExercisesWithSets(createdSession.id);
    return {
      session: createdSession,
      ...related,
      created: true
    };
  } catch (error) {
    const raced = await fetchActiveWorkoutSession(params.userId);
    if (raced) {
      const related = await fetchSessionExercisesWithSets(raced.id);
      return {
        session: raced,
        ...related,
        created: false
      };
    }

    throw error;
  }
};

export const completeSet = async (params: CompleteSetParams): Promise<void> => {
  if (params.reps === null || params.reps <= 0) {
    throw new Error("INVALID_COMPLETED_SET_REPS");
  }

  const response = await fetch("/api/workout/mutate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "complete_set",
      payload: {
        workoutExerciseId: params.workoutExerciseId,
        setId: params.setId,
        setNumber: params.setNumber,
        setType: params.setType,
        weightLbs: params.weightLbs,
        reps: params.reps,
        completedAt: params.completedAt
      }
    })
  });

  let parsed: { ok?: boolean; error?: string } | null = null;
  try {
    parsed = (await response.json()) as { ok?: boolean; error?: string };
  } catch {
    parsed = null;
  }

  if (!response.ok || parsed?.ok !== true) {
    throw new Error(parsed?.error ?? "MUTATION_FAILED");
  }
};

export const addSet = async (params: AddSetParams): Promise<DbWorkoutSet> => {
  const response = await fetch("/api/workout/mutate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "add_set",
      payload: {
        workoutExerciseId: params.workoutExerciseId,
        weightLbs: params.weightLbs,
        reps: params.reps,
        setType: params.setType
      }
    })
  });

  let parsed:
    | {
        ok?: boolean;
        error?: string;
        data?: {
          set?: DbWorkoutSet;
        };
      }
    | null = null;
  try {
    parsed = (await response.json()) as {
      ok?: boolean;
      error?: string;
      data?: {
        set?: DbWorkoutSet;
      };
    };
  } catch {
    parsed = null;
  }

  const createdSet = parsed?.data?.set;
  if (!response.ok || parsed?.ok !== true || !createdSet) {
    throw new Error(parsed?.error ?? "MUTATION_FAILED");
  }

  return createdSet;
};

export const deleteSet = async (params: DeleteSetParams): Promise<void> => {
  await deleteRows("workout_sets", {
    id: `eq.${params.setId}`,
    workout_exercise_id: `eq.${params.workoutExerciseId}`
  });

  await normalizeSetNumbers(params.workoutExerciseId);
};

export const reorderWorkoutExercises = async (params: ReorderWorkoutExercisesParams): Promise<void> => {
  const existing = await fetchRows<Pick<DbWorkoutExercise, "id">>("workout_exercises", {
    select: "id",
    session_id: `eq.${params.sessionId}`
  });

  const existingIds = existing.map((row) => row.id);
  const orderedIds = params.orderedWorkoutExerciseIds;

  if (existingIds.length !== orderedIds.length) {
    throw new Error("INVALID_REORDER_PAYLOAD");
  }

  const existingSet = new Set(existingIds);
  if (!orderedIds.every((id) => existingSet.has(id))) {
    throw new Error("INVALID_REORDER_PAYLOAD");
  }

  for (let index = 0; index < orderedIds.length; index += 1) {
    await updateRows<DbWorkoutExercise>(
      "workout_exercises",
      {
        id: `eq.${orderedIds[index]}`,
        session_id: `eq.${params.sessionId}`
      },
      {
        order_index: index + 1
      }
    );
  }
};

export const deleteWorkoutExercises = async (params: DeleteWorkoutExercisesParams): Promise<void> => {
  const uniqueIds = uniqueStrings(params.workoutExerciseIds);
  for (const workoutExerciseId of uniqueIds) {
    await deleteRows("workout_exercises", {
      id: `eq.${workoutExerciseId}`,
      session_id: `eq.${params.sessionId}`
    });
  }

  await normalizeSessionOrderIndexes(params.sessionId);
};
