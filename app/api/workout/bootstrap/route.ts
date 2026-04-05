import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getAuthEnv } from "@/lib/server/auth/env";
import { verifyAppSessionToken } from "@/lib/server/auth/session";

export const runtime = "nodejs";

type SetType = "working" | "warmup" | "drop" | "failure";

interface DbWorkoutSession {
  id: string;
  user_id: string;
  name: string | null;
  status: "active" | "completed" | "incomplete";
  started_at: string;
  ended_at: string | null;
}

interface DbWorkoutExercise {
  id: string;
  session_id: string;
  exercise_id: string;
  order_index: number;
  superset_group_id: string | null;
  created_at: string;
}

interface DbWorkoutSet {
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

interface DbExerciseCatalog {
  id: string;
  name: string;
  equipment: string[];
  muscle_groups: string[];
  instructions: string[];
  cues: string[];
  progressive_overload_notes: string | null;
}

interface StarterExerciseRow {
  id: string;
  slug: string;
}

interface LoadOrCreateSessionResult {
  session: DbWorkoutSession;
  workoutExercises: DbWorkoutExercise[];
  workoutSets: DbWorkoutSet[];
  exercisesById: Record<string, DbExerciseCatalog>;
  created: boolean;
}

interface SupabaseErrorResponse {
  code?: string;
}

interface BootstrapSetSpec {
  setNumber: number;
  setType: SetType;
  weightLbs: number | null;
  reps: number | null;
  completed?: boolean;
}

interface BootstrapExerciseSpec {
  slug: string;
  orderIndex: number;
  supersetGroup: "none" | "arms";
  sets: BootstrapSetSpec[];
}

const SESSION_NAME = "Push Day";
const STARTER_BOOTSTRAP_SPECS: BootstrapExerciseSpec[] = [
  {
    slug: "bench-press",
    orderIndex: 1,
    supersetGroup: "none",
    sets: [
      { setNumber: 1, setType: "warmup", weightLbs: 135, reps: 10, completed: true },
      { setNumber: 2, setType: "working", weightLbs: 140, reps: 10 },
      { setNumber: 3, setType: "working", weightLbs: 140, reps: 10 }
    ]
  },
  {
    slug: "pull-up",
    orderIndex: 2,
    supersetGroup: "none",
    sets: [
      { setNumber: 1, setType: "working", weightLbs: 15, reps: 8 },
      { setNumber: 2, setType: "working", weightLbs: 15, reps: 8 },
      { setNumber: 3, setType: "working", weightLbs: 15, reps: 8 }
    ]
  },
  {
    slug: "bicep-curl",
    orderIndex: 3,
    supersetGroup: "arms",
    sets: [
      { setNumber: 1, setType: "working", weightLbs: 35, reps: 12 },
      { setNumber: 2, setType: "working", weightLbs: 35, reps: 12 },
      { setNumber: 3, setType: "working", weightLbs: 35, reps: 12 }
    ]
  },
  {
    slug: "tricep-pushdown",
    orderIndex: 4,
    supersetGroup: "arms",
    sets: [
      { setNumber: 1, setType: "working", weightLbs: 50, reps: 12 },
      { setNumber: 2, setType: "working", weightLbs: 50, reps: 12 },
      { setNumber: 3, setType: "working", weightLbs: 50, reps: 12 }
    ]
  }
];

const buildInFilter = (values: string[]): string | undefined => {
  if (values.length === 0) {
    return undefined;
  }

  return `in.(${values.join(",")})`;
};

const createServiceHeaders = (serviceRoleKey: string, includeJson = true): HeadersInit => {
  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };

  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
};

const buildRestUrl = (
  supabaseUrl: string,
  path: string,
  query?: Record<string, string | undefined>
): string => {
  const base = supabaseUrl.endsWith("/") ? supabaseUrl : `${supabaseUrl}/`;
  const url = new URL(`rest/v1/${path}`, base);

  if (query) {
    const searchParams = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }

      searchParams.set(key, value);
    });
    url.search = searchParams.toString();
  }

  return url.toString();
};

const parseSupabaseError = async (response: Response): Promise<SupabaseErrorResponse | null> => {
  try {
    return (await response.json()) as SupabaseErrorResponse;
  } catch {
    return null;
  }
};

const fetchStarterExercises = async (
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<Record<string, string>> => {
  const response = await fetch(
    buildRestUrl(supabaseUrl, "exercises", {
      select: "id,slug",
      slug: buildInFilter(STARTER_BOOTSTRAP_SPECS.map((item) => item.slug))
    }),
    {
      method: "GET",
      headers: createServiceHeaders(serviceRoleKey, false),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error("STARTER_EXERCISES_FETCH_FAILED");
  }

  const rows = (await response.json()) as StarterExerciseRow[];
  const idBySlug = rows.reduce<Record<string, string>>((accumulator, row) => {
    accumulator[row.slug] = row.id;
    return accumulator;
  }, {});

  for (const spec of STARTER_BOOTSTRAP_SPECS) {
    if (!idBySlug[spec.slug]) {
      throw new Error(`MISSING_STARTER_EXERCISE:${spec.slug}`);
    }
  }

  return idBySlug;
};

const fetchActiveWorkoutSession = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
): Promise<DbWorkoutSession | null> => {
  const response = await fetch(
    buildRestUrl(supabaseUrl, "workout_sessions", {
      select: "*",
      user_id: `eq.${userId}`,
      status: "eq.active",
      order: "started_at.desc",
      limit: "1"
    }),
    {
      method: "GET",
      headers: createServiceHeaders(serviceRoleKey, false),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error("ACTIVE_SESSION_FETCH_FAILED");
  }

  const rows = (await response.json()) as DbWorkoutSession[];
  return rows[0] ?? null;
};

const createActiveWorkoutSession = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
): Promise<{ session: DbWorkoutSession; created: boolean }> => {
  const createResponse = await fetch(buildRestUrl(supabaseUrl, "workout_sessions"), {
    method: "POST",
    headers: {
      ...createServiceHeaders(serviceRoleKey),
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      user_id: userId,
      name: SESSION_NAME,
      status: "active"
    }),
    cache: "no-store"
  });

  if (createResponse.ok) {
    const rows = (await createResponse.json()) as DbWorkoutSession[];
    if (!rows[0]) {
      throw new Error("ACTIVE_SESSION_CREATE_EMPTY");
    }

    return {
      session: rows[0],
      created: true
    };
  }

  const maybeError = await parseSupabaseError(createResponse);
  if (createResponse.status === 409 || maybeError?.code === "23505") {
    const existing = await fetchActiveWorkoutSession(supabaseUrl, serviceRoleKey, userId);
    if (!existing) {
      throw new Error("ACTIVE_SESSION_CREATE_CONFLICT_WITHOUT_EXISTING");
    }

    return {
      session: existing,
      created: false
    };
  }

  throw new Error("ACTIVE_SESSION_CREATE_FAILED");
};

const bootstrapSessionContent = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  sessionId: string,
  starterExerciseIdBySlug: Record<string, string>
): Promise<void> => {
  const armsSupersetGroupId = randomUUID();

  for (const exerciseSpec of STARTER_BOOTSTRAP_SPECS) {
    const exerciseId = starterExerciseIdBySlug[exerciseSpec.slug];
    if (!exerciseId) {
      throw new Error(`MISSING_STARTER_EXERCISE:${exerciseSpec.slug}`);
    }

    const exerciseResponse = await fetch(buildRestUrl(supabaseUrl, "workout_exercises"), {
      method: "POST",
      headers: {
        ...createServiceHeaders(serviceRoleKey),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        session_id: sessionId,
        exercise_id: exerciseId,
        order_index: exerciseSpec.orderIndex,
        superset_group_id: exerciseSpec.supersetGroup === "arms" ? armsSupersetGroupId : null
      }),
      cache: "no-store"
    });

    if (!exerciseResponse.ok) {
      throw new Error("WORKOUT_EXERCISE_BOOTSTRAP_FAILED");
    }

    const exerciseRows = (await exerciseResponse.json()) as DbWorkoutExercise[];
    const workoutExercise = exerciseRows[0];
    if (!workoutExercise) {
      throw new Error("WORKOUT_EXERCISE_BOOTSTRAP_EMPTY");
    }

    for (const setSpec of exerciseSpec.sets) {
      const completed = setSpec.completed ?? false;
      const setResponse = await fetch(buildRestUrl(supabaseUrl, "workout_sets"), {
        method: "POST",
        headers: {
          ...createServiceHeaders(serviceRoleKey),
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          workout_exercise_id: workoutExercise.id,
          set_number: setSpec.setNumber,
          set_type: setSpec.setType,
          weight_lbs: setSpec.weightLbs,
          reps: setSpec.reps,
          completed,
          completed_at: completed ? new Date().toISOString() : null
        }),
        cache: "no-store"
      });

      if (!setResponse.ok) {
        throw new Error("WORKOUT_SET_BOOTSTRAP_FAILED");
      }
    }
  }
};

const fetchSessionBundle = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  sessionId: string
): Promise<Pick<LoadOrCreateSessionResult, "workoutExercises" | "workoutSets" | "exercisesById">> => {
  const exercisesResponse = await fetch(
    buildRestUrl(supabaseUrl, "workout_exercises", {
      select: "*",
      session_id: `eq.${sessionId}`,
      order: "order_index.asc"
    }),
    {
      method: "GET",
      headers: createServiceHeaders(serviceRoleKey, false),
      cache: "no-store"
    }
  );

  if (!exercisesResponse.ok) {
    throw new Error("WORKOUT_EXERCISE_FETCH_FAILED");
  }

  const workoutExercises = (await exercisesResponse.json()) as DbWorkoutExercise[];
  if (workoutExercises.length === 0) {
    return {
      workoutExercises: [],
      workoutSets: [],
      exercisesById: {}
    };
  }

  const workoutExerciseIds = workoutExercises.map((exercise) => exercise.id);
  const setsResponse = await fetch(
    buildRestUrl(supabaseUrl, "workout_sets", {
      select: "*",
      workout_exercise_id: buildInFilter(workoutExerciseIds),
      order: "set_number.asc"
    }),
    {
      method: "GET",
      headers: createServiceHeaders(serviceRoleKey, false),
      cache: "no-store"
    }
  );

  if (!setsResponse.ok) {
    throw new Error("WORKOUT_SET_FETCH_FAILED");
  }

  const workoutSets = (await setsResponse.json()) as DbWorkoutSet[];
  const exerciseIds = [...new Set(workoutExercises.map((exercise) => exercise.exercise_id))];

  const catalogResponse = await fetch(
    buildRestUrl(supabaseUrl, "exercises", {
      select: "id,name,equipment,muscle_groups,instructions,cues,progressive_overload_notes",
      id: buildInFilter(exerciseIds)
    }),
    {
      method: "GET",
      headers: createServiceHeaders(serviceRoleKey, false),
      cache: "no-store"
    }
  );

  if (!catalogResponse.ok) {
    throw new Error("EXERCISE_CATALOG_FETCH_FAILED");
  }

  const catalogRows = (await catalogResponse.json()) as DbExerciseCatalog[];
  const exercisesById = catalogRows.reduce<Record<string, DbExerciseCatalog>>((accumulator, row) => {
    accumulator[row.id] = row;
    return accumulator;
  }, {});

  return {
    workoutExercises,
    workoutSets,
    exercisesById
  };
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  let env;
  try {
    env = getAuthEnv();
  } catch {
    return NextResponse.json({ error: "AUTH_ENV_INVALID" }, { status: 500 });
  }

  const token = request.cookies.get(env.appSessionCookieName)?.value;
  const sessionCheck = verifyAppSessionToken(token, env.appSessionSecret);
  if (!sessionCheck.ok || !sessionCheck.payload) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const userId = sessionCheck.payload.sub;
    const starterExerciseIdBySlug = await fetchStarterExercises(env.supabaseUrl, env.supabaseServiceRoleKey);

    let session = await fetchActiveWorkoutSession(env.supabaseUrl, env.supabaseServiceRoleKey, userId);
    let created = false;

    if (!session) {
      const createdResult = await createActiveWorkoutSession(env.supabaseUrl, env.supabaseServiceRoleKey, userId);
      session = createdResult.session;
      created = createdResult.created;

      if (created) {
        await bootstrapSessionContent(
          env.supabaseUrl,
          env.supabaseServiceRoleKey,
          session.id,
          starterExerciseIdBySlug
        );
      }
    }

    const bundle = await fetchSessionBundle(env.supabaseUrl, env.supabaseServiceRoleKey, session.id);
    return NextResponse.json<LoadOrCreateSessionResult>({
      session,
      ...bundle,
      created
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WORKOUT_BOOTSTRAP_FAILED";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

