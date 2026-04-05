import { NextRequest, NextResponse } from "next/server";

import { getAuthEnv } from "@/lib/server/auth/env";
import { verifyAppSessionToken } from "@/lib/server/auth/session";

export const runtime = "nodejs";

type MutationAction = "complete_set" | "add_set" | "delete_set" | "delete_workout_exercises";
type SetType = "working" | "warmup" | "drop" | "failure";

interface CompleteSetPayload {
  workoutExerciseId: string;
  setId: string;
  setNumber: number;
  setType: SetType;
  weightLbs: number | null;
  reps: number | null;
  completedAt: string;
}

interface AddSetPayload {
  workoutExerciseId: string;
  weightLbs: number | null;
  reps: number | null;
  setType?: SetType;
}

interface DeleteSetPayload {
  workoutExerciseId: string;
  setId: string;
}

interface DeleteWorkoutExercisesPayload {
  sessionId: string;
  workoutExerciseIds: string[];
}

interface MutationRequestBody {
  action?: unknown;
  payload?: unknown;
}

interface WorkoutExerciseOwnerRow {
  id: string;
  session_id: string;
}

interface WorkoutSessionOwnerRow {
  id: string;
}

interface WorkoutSetRow {
  id: string;
}

interface SupabaseErrorResponse {
  code?: string;
}

type ParsedMutationRequest =
  | { action: "complete_set"; payload: CompleteSetPayload }
  | { action: "add_set"; payload: AddSetPayload }
  | { action: "delete_set"; payload: DeleteSetPayload }
  | { action: "delete_workout_exercises"; payload: DeleteWorkoutExercisesPayload };

const allowedActions: readonly MutationAction[] = [
  "complete_set",
  "add_set",
  "delete_set",
  "delete_workout_exercises"
] as const;

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isNonBlankString = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

const isNullableNumber = (value: unknown): value is number | null => {
  return value === null || (typeof value === "number" && Number.isFinite(value));
};

const isValidSetType = (value: unknown): value is SetType => {
  return value === "working" || value === "warmup" || value === "drop" || value === "failure";
};

const invalidInputResponse = () => {
  return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
};

const unauthorizedResponse = () => {
  return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
};

const forbiddenResponse = () => {
  return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
};

const notFoundResponse = () => {
  return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
};

const mutationFailedResponse = () => {
  return NextResponse.json({ ok: false, error: "MUTATION_FAILED" }, { status: 500 });
};

const notImplementedResponse = () => {
  return NextResponse.json({ ok: false, error: "MUTATION_NOT_IMPLEMENTED" }, { status: 501 });
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

const isValidIsoDateTime = (value: string): boolean => {
  return !Number.isNaN(Date.parse(value));
};

const loadWorkoutExerciseOwnership = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  workoutExerciseId: string
): Promise<WorkoutExerciseOwnerRow | null> => {
  const response = await fetch(
    buildRestUrl(supabaseUrl, "workout_exercises", {
      select: "id,session_id",
      id: `eq.${workoutExerciseId}`,
      limit: "1"
    }),
    {
      method: "GET",
      headers: createServiceHeaders(serviceRoleKey, false),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error("WORKOUT_EXERCISE_LOOKUP_FAILED");
  }

  const rows = (await response.json()) as WorkoutExerciseOwnerRow[];
  return rows[0] ?? null;
};

const verifySessionOwnership = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  sessionId: string,
  principalId: string
): Promise<boolean> => {
  const response = await fetch(
    buildRestUrl(supabaseUrl, "workout_sessions", {
      select: "id",
      id: `eq.${sessionId}`,
      user_id: `eq.${principalId}`,
      limit: "1"
    }),
    {
      method: "GET",
      headers: createServiceHeaders(serviceRoleKey, false),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error("WORKOUT_SESSION_OWNERSHIP_LOOKUP_FAILED");
  }

  const rows = (await response.json()) as WorkoutSessionOwnerRow[];
  return Boolean(rows[0]);
};

const checkWorkoutSetExists = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  workoutExerciseId: string,
  setId: string
): Promise<boolean> => {
  const response = await fetch(
    buildRestUrl(supabaseUrl, "workout_sets", {
      select: "id",
      id: `eq.${setId}`,
      workout_exercise_id: `eq.${workoutExerciseId}`,
      limit: "1"
    }),
    {
      method: "GET",
      headers: createServiceHeaders(serviceRoleKey, false),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error("WORKOUT_SET_LOOKUP_FAILED");
  }

  const rows = (await response.json()) as WorkoutSetRow[];
  return Boolean(rows[0]);
};

const updateCompletedSet = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: CompleteSetPayload
): Promise<boolean> => {
  const response = await fetch(
    buildRestUrl(supabaseUrl, "workout_sets", {
      id: `eq.${payload.setId}`,
      workout_exercise_id: `eq.${payload.workoutExerciseId}`
    }),
    {
      method: "PATCH",
      headers: {
        ...createServiceHeaders(serviceRoleKey),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        set_number: payload.setNumber,
        set_type: payload.setType,
        weight_lbs: payload.weightLbs,
        reps: payload.reps,
        completed: true,
        completed_at: payload.completedAt
      }),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const maybeError = await parseSupabaseError(response);
    if (response.status === 404 || maybeError?.code === "PGRST116") {
      return false;
    }

    throw new Error("WORKOUT_SET_UPDATE_FAILED");
  }

  const rows = (await response.json()) as WorkoutSetRow[];
  return Boolean(rows[0]);
};

const parseCompleteSetPayload = (payload: unknown): CompleteSetPayload | null => {
  if (!isObject(payload)) {
    return null;
  }

  const workoutExerciseId = payload.workoutExerciseId;
  const setId = payload.setId;
  const setNumber = payload.setNumber;
  const setType = payload.setType;
  const weightLbs = payload.weightLbs;
  const reps = payload.reps;
  const completedAt = payload.completedAt;

  if (
    !isNonBlankString(workoutExerciseId) ||
    !isNonBlankString(setId) ||
    typeof setNumber !== "number" ||
    !Number.isInteger(setNumber) ||
    setNumber <= 0 ||
    !isValidSetType(setType) ||
    !isNullableNumber(weightLbs) ||
    typeof reps !== "number" ||
    !Number.isInteger(reps) ||
    reps <= 0 || // product lock: completed set requires reps > 0
    !isNonBlankString(completedAt)
  ) {
    return null;
  }

  return {
    workoutExerciseId: workoutExerciseId.trim(),
    setId: setId.trim(),
    setNumber,
    setType,
    weightLbs,
    reps,
    completedAt: completedAt.trim()
  };
};

const parseAddSetPayload = (payload: unknown): AddSetPayload | null => {
  if (!isObject(payload)) {
    return null;
  }

  const workoutExerciseId = payload.workoutExerciseId;
  const weightLbs = payload.weightLbs;
  const reps = payload.reps;
  const setType = payload.setType;

  if (!isNonBlankString(workoutExerciseId) || !isNullableNumber(weightLbs) || !isNullableNumber(reps)) {
    return null;
  }

  if (setType !== undefined && !isValidSetType(setType)) {
    return null;
  }

  return {
    workoutExerciseId: workoutExerciseId.trim(),
    weightLbs,
    reps,
    setType
  };
};

const parseDeleteSetPayload = (payload: unknown): DeleteSetPayload | null => {
  if (!isObject(payload)) {
    return null;
  }

  const workoutExerciseId = payload.workoutExerciseId;
  const setId = payload.setId;
  if (!isNonBlankString(workoutExerciseId) || !isNonBlankString(setId)) {
    return null;
  }

  return {
    workoutExerciseId: workoutExerciseId.trim(),
    setId: setId.trim()
  };
};

const parseDeleteWorkoutExercisesPayload = (payload: unknown): DeleteWorkoutExercisesPayload | null => {
  if (!isObject(payload)) {
    return null;
  }

  const sessionId = payload.sessionId;
  const workoutExerciseIds = payload.workoutExerciseIds;

  if (!isNonBlankString(sessionId) || !Array.isArray(workoutExerciseIds) || workoutExerciseIds.length === 0) {
    return null;
  }

  const normalizedIds = workoutExerciseIds
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);

  if (normalizedIds.length !== workoutExerciseIds.length) {
    return null;
  }

  return {
    sessionId: sessionId.trim(),
    workoutExerciseIds: [...new Set(normalizedIds)]
  };
};

const parseMutationRequest = (body: MutationRequestBody): ParsedMutationRequest | null => {
  if (!allowedActions.includes(body.action as MutationAction)) {
    return null;
  }

  if (body.action === "complete_set") {
    const payload = parseCompleteSetPayload(body.payload);
    return payload ? { action: "complete_set", payload } : null;
  }

  if (body.action === "add_set") {
    const payload = parseAddSetPayload(body.payload);
    return payload ? { action: "add_set", payload } : null;
  }

  if (body.action === "delete_set") {
    const payload = parseDeleteSetPayload(body.payload);
    return payload ? { action: "delete_set", payload } : null;
  }

  if (body.action === "delete_workout_exercises") {
    const payload = parseDeleteWorkoutExercisesPayload(body.payload);
    return payload ? { action: "delete_workout_exercises", payload } : null;
  }

  return null;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  let env;
  try {
    env = getAuthEnv();
  } catch {
    return NextResponse.json({ ok: false, error: "AUTH_ENV_INVALID" }, { status: 500 });
  }

  const token = request.cookies.get(env.appSessionCookieName)?.value;
  const sessionCheck = verifyAppSessionToken(token, env.appSessionSecret);
  if (!sessionCheck.ok || !sessionCheck.payload) {
    return unauthorizedResponse();
  }

  let body: MutationRequestBody;
  try {
    body = (await request.json()) as MutationRequestBody;
  } catch {
    return invalidInputResponse();
  }

  const parsedRequest = parseMutationRequest(body);
  if (!parsedRequest) {
    return invalidInputResponse();
  }

  switch (parsedRequest.action) {
    case "complete_set": {
      const reps = parsedRequest.payload.reps;
      if (typeof reps !== "number" || reps <= 0 || !isValidIsoDateTime(parsedRequest.payload.completedAt)) {
        return invalidInputResponse();
      }

      try {
        const workoutExercise = await loadWorkoutExerciseOwnership(
          env.supabaseUrl,
          env.supabaseServiceRoleKey,
          parsedRequest.payload.workoutExerciseId
        );
        if (!workoutExercise) {
          return notFoundResponse();
        }

        const isOwner = await verifySessionOwnership(
          env.supabaseUrl,
          env.supabaseServiceRoleKey,
          workoutExercise.session_id,
          sessionCheck.payload.sub
        );
        if (!isOwner) {
          return forbiddenResponse();
        }

        const hasSet = await checkWorkoutSetExists(
          env.supabaseUrl,
          env.supabaseServiceRoleKey,
          parsedRequest.payload.workoutExerciseId,
          parsedRequest.payload.setId
        );
        if (!hasSet) {
          return notFoundResponse();
        }

        const updated = await updateCompletedSet(env.supabaseUrl, env.supabaseServiceRoleKey, parsedRequest.payload);
        if (!updated) {
          return notFoundResponse();
        }

        return NextResponse.json({ ok: true, action: "complete_set" });
      } catch {
        return mutationFailedResponse();
      }
    }
    case "add_set":
    case "delete_set":
    case "delete_workout_exercises":
      return notImplementedResponse();
    default:
      return invalidInputResponse();
  }
}
