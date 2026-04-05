"use client";

import React, { useEffect, useMemo, useState } from "react";

import { ExerciseRow } from "@/components/workout/ExerciseRow";
import { SupersetRow } from "@/components/workout/SupersetRow";
import { TimerStrip } from "@/components/workout/TimerStrip";
import {
  addSet as persistAddSet,
  completeSet as persistCompleteSet,
  deleteSet as persistDeleteSet,
  deleteWorkoutExercises as persistDeleteWorkoutExercises,
  reorderWorkoutExercises as persistReorderWorkoutExercises,
  type BootstrapWorkoutExerciseInput,
  type DbExerciseCatalog,
  type DbWorkoutExercise,
  type DbWorkoutSet,
  type LoadOrCreateSessionResult
} from "@/components/workout/workoutDataClient";
import { ExerciseDetail, type PersistSetPayload } from "@/screens/workout/ExerciseDetail";
import { ExerciseDetailSheet } from "@/screens/workout/ExerciseDetailSheet";
import type {
  DetailTarget,
  ExerciseLink,
  ExerciseSet,
  SetType,
  WorkoutExercise,
  WorkoutPreferences,
  WorkoutSession
} from "@/types/workout";

const createMockSession = (): WorkoutSession => {
  const now = new Date().toISOString();

  return {
    id: "session-1",
    name: "Push Day",
    startedAt: now,
    elapsedSeconds: 12 * 60 + 10,
    restTimer: null,
    supersetGroups: [{ id: "superset-arms", exerciseIds: ["curl", "pushdown"] }],
    exercises: [
      {
        id: "bench",
        name: "Bench Press",
        equipment: "barbell",
        order: 1,
        supersetGroupId: null,
        repRangeTop: 12,
        muscleGroups: ["Chest", "Shoulders", "Triceps"],
        notes: "Keep scapula retracted.",
        instructions: "Plant feet, squeeze shoulder blades, drive bar over mid-foot.",
        links: [
          {
            id: "bench-link-1",
            url: "https://www.youtube.com/watch?v=gRVjAtPip0Y",
            title: "Jeff Nippard",
            platform: "youtube"
          }
        ],
        sets: [
          {
            id: "bench-set-1",
            setNumber: 1,
            weightLbs: 135,
            reps: 10,
            setType: "warmup",
            completed: true,
            completedAt: now,
            suggestionDirection: "hold",
            weightEdited: false
          },
          {
            id: "bench-set-2",
            setNumber: 2,
            weightLbs: 140,
            reps: 10,
            setType: "working",
            completed: false,
            completedAt: null,
            suggestionDirection: "up",
            weightEdited: false
          },
          {
            id: "bench-set-3",
            setNumber: 3,
            weightLbs: 140,
            reps: 10,
            setType: "working",
            completed: false,
            completedAt: null,
            suggestionDirection: "up",
            weightEdited: false
          }
        ]
      },
      {
        id: "pullup",
        name: "Pull Up",
        equipment: "bodyweight",
        order: 2,
        supersetGroupId: null,
        repRangeTop: 12,
        muscleGroups: ["Back", "Biceps"],
        notes: "Full hang each rep.",
        instructions: "Pull chest to bar, control lowering.",
        links: [],
        sets: [
          {
            id: "pullup-set-1",
            setNumber: 1,
            weightLbs: 15,
            reps: 8,
            setType: "working",
            completed: false,
            completedAt: null,
            suggestionDirection: "hold",
            weightEdited: false
          },
          {
            id: "pullup-set-2",
            setNumber: 2,
            weightLbs: 15,
            reps: 8,
            setType: "working",
            completed: false,
            completedAt: null,
            suggestionDirection: "hold",
            weightEdited: false
          },
          {
            id: "pullup-set-3",
            setNumber: 3,
            weightLbs: 15,
            reps: 8,
            setType: "working",
            completed: false,
            completedAt: null,
            suggestionDirection: "hold",
            weightEdited: false
          }
        ]
      },
      {
        id: "curl",
        name: "Bicep Curl",
        equipment: "cable",
        order: 3,
        supersetGroupId: "superset-arms",
        repRangeTop: 12,
        muscleGroups: ["Biceps"],
        notes: "Elbows pinned.",
        instructions: "Control eccentric, no torso swing.",
        links: [],
        sets: [
          {
            id: "curl-set-1",
            setNumber: 1,
            weightLbs: 35,
            reps: 12,
            setType: "working",
            completed: false,
            completedAt: null,
            suggestionDirection: "hold",
            weightEdited: false
          },
          {
            id: "curl-set-2",
            setNumber: 2,
            weightLbs: 35,
            reps: 12,
            setType: "working",
            completed: false,
            completedAt: null,
            suggestionDirection: "hold",
            weightEdited: false
          },
          {
            id: "curl-set-3",
            setNumber: 3,
            weightLbs: 35,
            reps: 12,
            setType: "working",
            completed: false,
            completedAt: null,
            suggestionDirection: "hold",
            weightEdited: false
          }
        ]
      },
      {
        id: "pushdown",
        name: "Tricep Pushdown",
        equipment: "cable",
        order: 4,
        supersetGroupId: "superset-arms",
        repRangeTop: 12,
        muscleGroups: ["Triceps"],
        notes: "Keep shoulders down.",
        instructions: "Drive rope down and split at bottom.",
        links: [],
        sets: [
          {
            id: "pushdown-set-1",
            setNumber: 1,
            weightLbs: 50,
            reps: 12,
            setType: "working",
            completed: false,
            completedAt: null,
            suggestionDirection: "hold",
            weightEdited: false
          },
          {
            id: "pushdown-set-2",
            setNumber: 2,
            weightLbs: 50,
            reps: 12,
            setType: "working",
            completed: false,
            completedAt: null,
            suggestionDirection: "hold",
            weightEdited: false
          },
          {
            id: "pushdown-set-3",
            setNumber: 3,
            weightLbs: 50,
            reps: 12,
            setType: "working",
            completed: false,
            completedAt: null,
            suggestionDirection: "hold",
            weightEdited: false
          }
        ]
      }
    ]
  };
};

const defaultPreferences: WorkoutPreferences = {
  showSetTypeTags: false,
  preferredUnit: "lbs",
  trainingGoal: "hypertrophy",
  experienceLevel: "intermediate"
};

const WORKOUT_PREFERENCES_STORAGE_KEY = "lifetime.workoutPreferences";

const getStoredPreferences = (): WorkoutPreferences => {
  if (typeof window === "undefined") {
    return defaultPreferences;
  }

  try {
    const rawPreferences = window.localStorage.getItem(WORKOUT_PREFERENCES_STORAGE_KEY);
    if (!rawPreferences) {
      return defaultPreferences;
    }

    const parsed = JSON.parse(rawPreferences) as Partial<WorkoutPreferences>;
    return {
      ...defaultPreferences,
      ...parsed,
      showSetTypeTags: parsed.showSetTypeTags ?? defaultPreferences.showSetTypeTags
    };
  } catch {
    return defaultPreferences;
  }
};

const isExerciseComplete = (exercise: WorkoutExercise) => {
  return exercise.sets.length > 0 && exercise.sets.every((set) => set.completed);
};

const getCompletedSetCount = (exercise: WorkoutExercise) => {
  return exercise.sets.filter((set) => set.completed).length;
};

const getSetCount = (exercise: WorkoutExercise) => {
  return exercise.sets.length;
};

const getArrowFromExercise = (exercise: WorkoutExercise): "↑" | "—" | "↓" => {
  const firstPending = exercise.sets.find((set) => !set.completed) ?? exercise.sets[0];
  if (!firstPending?.suggestionDirection || firstPending.weightEdited) {
    return "—";
  }

  if (firstPending.suggestionDirection === "up") {
    return "↑";
  }

  if (firstPending.suggestionDirection === "down") {
    return "↓";
  }

  return "—";
};

const getSuggestedWeightText = (exercise: WorkoutExercise) => {
  const pending = exercise.sets.find((set) => !set.completed) ?? exercise.sets[exercise.sets.length - 1];
  if (!pending) {
    return "—";
  }

  if (exercise.equipment === "bodyweight") {
    return pending.weightLbs && pending.weightLbs > 0 ? `BW+${pending.weightLbs}` : "BW";
  }

  return pending.weightLbs === null ? "—" : `${pending.weightLbs}`;
};

const getSuggestedRepsText = (exercise: WorkoutExercise) => {
  const pending = exercise.sets.find((set) => !set.completed) ?? exercise.sets[exercise.sets.length - 1];
  if (!pending?.reps) {
    return "— reps";
  }

  return `${pending.reps} reps`;
};

const sortedExercises = (exercises: WorkoutExercise[]) => {
  return [...exercises].sort((left, right) => left.order - right.order);
};

const getSetTypeForNewSet = (): SetType => "working";

type OverviewRow = { type: "single" | "superset"; exerciseIds: string[] };

const buildGroupedRows = (exerciseList: WorkoutExercise[]): OverviewRow[] => {
  const rows: OverviewRow[] = [];

  for (let index = 0; index < exerciseList.length; index += 1) {
    const exercise = exerciseList[index];
    const nextExercise = exerciseList[index + 1];

    if (
      exercise.supersetGroupId &&
      nextExercise?.supersetGroupId &&
      exercise.supersetGroupId === nextExercise.supersetGroupId
    ) {
      rows.push({ type: "superset", exerciseIds: [exercise.id, nextExercise.id] });
      index += 1;
      continue;
    }

    rows.push({ type: "single", exerciseIds: [exercise.id] });
  }

  return rows;
};

const STARTER_EXERCISE_SLUG_BY_TEMPLATE_ID: Record<string, string> = {
  bench: "bench-press",
  pullup: "pull-up",
  curl: "bicep-curl",
  pushdown: "tricep-pushdown"
};

const STARTER_EXERCISE_SLUGS = [
  "bench-press",
  "pull-up",
  "bicep-curl",
  "tricep-pushdown"
] as const;

interface StarterExerciseRow {
  id: string;
  slug: string;
}

interface WorkoutBootstrapErrorResponse {
  error?: string;
}

const toWorkoutEquipment = (equipment: string[]): WorkoutExercise["equipment"] => {
  if (equipment.includes("barbell")) {
    return "barbell";
  }

  if (equipment.includes("bodyweight")) {
    return "bodyweight";
  }

  if (equipment.includes("dumbbell")) {
    return "dumbbell";
  }

  return "cable";
};

const toTitleCase = (value: string) => {
  if (!value) {
    return value;
  }

  return value[0].toUpperCase() + value.slice(1);
};

const buildBootstrapExercises = (
  templateSession: WorkoutSession,
  seededExerciseIdByTemplateId: Record<string, string>
): BootstrapWorkoutExerciseInput[] => {
  return sortedExercises(templateSession.exercises).map((exercise) => {
    const seededExerciseId = seededExerciseIdByTemplateId[exercise.id];
    if (!seededExerciseId) {
      throw new Error(`MISSING_SEEDED_EXERCISE_FOR_TEMPLATE:${exercise.id}`);
    }

    return {
      exerciseId: seededExerciseId,
      orderIndex: exercise.order,
      supersetGroupId: exercise.supersetGroupId,
      sets: exercise.sets.map((setRow) => ({
        setNumber: setRow.setNumber,
        setType: setRow.setType,
        weightLbs: setRow.weightLbs,
        reps: setRow.reps,
        completed: setRow.completed,
        completedAt: setRow.completedAt
      }))
    };
  });
};

const mapDbSessionToUi = (result: LoadOrCreateSessionResult): WorkoutSession => {
  const setsByWorkoutExerciseId = result.workoutSets.reduce<Record<string, DbWorkoutSet[]>>((accumulator, setRow) => {
    if (!accumulator[setRow.workout_exercise_id]) {
      accumulator[setRow.workout_exercise_id] = [];
    }

    accumulator[setRow.workout_exercise_id].push(setRow);
    return accumulator;
  }, {});

  const mapExercise = (workoutExercise: DbWorkoutExercise): WorkoutExercise => {
    const catalog: DbExerciseCatalog | undefined = result.exercisesById[workoutExercise.exercise_id];
    const setRows = [...(setsByWorkoutExerciseId[workoutExercise.id] ?? [])]
      .sort((left, right) => left.set_number - right.set_number)
      .map(
        (setRow): ExerciseSet => ({
          id: setRow.id,
          setNumber: setRow.set_number,
          weightLbs: setRow.weight_lbs,
          reps: setRow.reps,
          setType: setRow.set_type,
          completed: setRow.completed,
          completedAt: setRow.completed_at,
          suggestionDirection: "hold",
          weightEdited: false
        })
      );

    const repRangeTop = setRows.reduce((max, row) => Math.max(max, row.reps ?? 0), 0) || 12;

    return {
      id: workoutExercise.id,
      name: catalog?.name ?? "Exercise",
      equipment: toWorkoutEquipment(catalog?.equipment ?? []),
      order: workoutExercise.order_index,
      supersetGroupId: workoutExercise.superset_group_id,
      sets: setRows,
      repRangeTop,
      muscleGroups: (catalog?.muscle_groups ?? []).map(toTitleCase),
      notes: catalog?.progressive_overload_notes ?? "",
      instructions: (catalog?.instructions ?? []).join(" "),
      links: []
    };
  };

  const exercises = [...result.workoutExercises].sort((left, right) => left.order_index - right.order_index).map(mapExercise);

  const groupMap = new Map<string, string[]>();
  exercises.forEach((exercise) => {
    if (!exercise.supersetGroupId) {
      return;
    }

    if (!groupMap.has(exercise.supersetGroupId)) {
      groupMap.set(exercise.supersetGroupId, []);
    }

    groupMap.get(exercise.supersetGroupId)?.push(exercise.id);
  });

  const supersetGroups = [...groupMap.entries()]
    .filter(([, exerciseIds]) => exerciseIds.length >= 2)
    .map(([id, exerciseIds]) => ({
      id,
      exerciseIds: [exerciseIds[0], exerciseIds[1]] as [string, string]
    }));

  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(result.session.started_at).getTime()) / 1000)
  );

  return {
    id: result.session.id,
    name: result.session.name,
    startedAt: result.session.started_at,
    elapsedSeconds,
    restTimer: null,
    exercises,
    supersetGroups
  };
};

const compoundMusclePriority = new Set(["chest", "back", "quads", "hamstrings", "shoulders"]);
const isolationMusclePriority = new Set(["biceps", "triceps", "calves", "forearms"]);

const getMusclePriorityScore = (muscleGroup: string) => {
  const normalized = muscleGroup.toLowerCase();
  if (compoundMusclePriority.has(normalized)) {
    return 2;
  }

  if (isolationMusclePriority.has(normalized)) {
    return 1;
  }

  return 0;
};

interface SessionOverviewProps {
  authenticatedUserId: string;
}

export const SessionOverview = ({ authenticatedUserId }: SessionOverviewProps) => {
  const [session, setSession] = useState<WorkoutSession>(() => createMockSession());
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [preferences] = useState<WorkoutPreferences>(() => getStoredPreferences());
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [stubScreen, setStubScreen] = useState<"exercise-browser" | "session-summary" | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);
  const [draggingRowKey, setDraggingRowKey] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [exerciseDeleteDialog, setExerciseDeleteDialog] = useState<{ exerciseIds: string[]; label: string } | null>(
    null
  );

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      setIsSessionLoading(true);
      setSessionError(null);

      try {
        const response = await fetch("/api/workout/bootstrap", {
          method: "GET",
          cache: "no-store"
        });

        if (!response.ok) {
          let errorCode = "WORKOUT_BOOTSTRAP_FAILED";
          try {
            const errorPayload = (await response.json()) as WorkoutBootstrapErrorResponse;
            if (errorPayload.error && errorPayload.error.trim().length > 0) {
              errorCode = errorPayload.error.trim();
            }
          } catch {
            // Keep fallback error code.
          }

          throw new Error(errorCode);
        }

        const loaded = (await response.json()) as LoadOrCreateSessionResult;

        if (!active) {
          return;
        }

        setSession(mapDbSessionToUi(loaded));
      } catch (loadError) {
        if (!active) {
          return;
        }

        const message = loadError instanceof Error ? loadError.message : "Failed to load workout session.";
        setSessionError(message);
      } finally {
        if (active) {
          setIsSessionLoading(false);
        }
      }
    };

    void loadSession();

    return () => {
      active = false;
    };
  }, [authenticatedUserId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSession((previous) => {
        const nextElapsed = previous.elapsedSeconds + 1;
        let nextRest = previous.restTimer;

        if (nextRest?.active) {
          const remaining = Math.max(nextRest.remainingSeconds - 1, 0);
          nextRest = remaining === 0 ? null : { ...nextRest, remainingSeconds: remaining };
        }

        return {
          ...previous,
          elapsedSeconds: nextElapsed,
          restTimer: nextRest
        };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const exercises = useMemo(() => sortedExercises(session.exercises), [session.exercises]);

  const completedExercises = useMemo(() => exercises.filter((exercise) => isExerciseComplete(exercise)), [exercises]);
  const inProgressExercises = useMemo(() => exercises.filter((exercise) => !isExerciseComplete(exercise)), [exercises]);

  const currentExerciseId = useMemo(() => {
    const partial = exercises.find((exercise) => {
      const completedCount = getCompletedSetCount(exercise);
      return completedCount > 0 && completedCount < exercise.sets.length;
    });
    if (partial) {
      return partial.id;
    }

    const firstIncomplete = exercises.find((exercise) => getCompletedSetCount(exercise) < exercise.sets.length);
    return firstIncomplete?.id ?? null;
  }, [exercises]);

  const muscleGroupText = useMemo(() => {
    const counts = new Map<string, number>();

    exercises.forEach((exercise) => {
      exercise.muscleGroups.forEach((group) => {
        counts.set(group, (counts.get(group) ?? 0) + 1);
      });
    });

    return [...counts.entries()]
      .sort((left, right) => {
        if (left[1] !== right[1]) {
          return right[1] - left[1];
        }

        const leftPriority = getMusclePriorityScore(left[0]);
        const rightPriority = getMusclePriorityScore(right[0]);
        if (leftPriority !== rightPriority) {
          return rightPriority - leftPriority;
        }

        return left[0].localeCompare(right[0]);
      })
      .slice(0, 3)
      .map(([name]) => name)
      .join(" · ");
  }, [exercises]);

  const updateSet = (exerciseId: string, setId: string, patch: Partial<ExerciseSet>) => {
    setSession((previous) => ({
      ...previous,
      exercises: previous.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        return {
          ...exercise,
          sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...patch } : set))
        };
      })
    }));
  };

  const deleteSet = (exerciseId: string, setId: string) => {
    void (async () => {
      try {
        await persistDeleteSet({
          workoutExerciseId: exerciseId,
          setId
        });

        setSession((previous) => ({
          ...previous,
          exercises: previous.exercises.map((exercise) => {
            if (exercise.id !== exerciseId) {
              return exercise;
            }

            const nextSets = exercise.sets
              .filter((set) => set.id !== setId)
              .map((set, index) => ({ ...set, setNumber: index + 1 }));

            return {
              ...exercise,
              sets: nextSets
            };
          })
        }));
        setPersistenceError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete set.";
        setPersistenceError(message);
      }
    })();
  };

  const addSet = (exerciseId: string) => {
    const targetExercise = session.exercises.find((exercise) => exercise.id === exerciseId);
    if (!targetExercise) {
      return;
    }

    const lastSet = targetExercise.sets[targetExercise.sets.length - 1] ?? null;

    void (async () => {
      try {
        const createdSet = await persistAddSet({
          workoutExerciseId: exerciseId,
          weightLbs: lastSet?.weightLbs ?? null,
          reps: lastSet?.reps ?? null,
          setType: getSetTypeForNewSet()
        });

        setSession((previous) => ({
          ...previous,
          exercises: previous.exercises.map((exercise) => {
            if (exercise.id !== exerciseId) {
              return exercise;
            }

            return {
              ...exercise,
              sets: [
                ...exercise.sets,
                {
                  id: createdSet.id,
                  setNumber: createdSet.set_number,
                  weightLbs: createdSet.weight_lbs,
                  reps: createdSet.reps,
                  setType: createdSet.set_type,
                  completed: createdSet.completed,
                  completedAt: createdSet.completed_at,
                  suggestionDirection: lastSet?.suggestionDirection ?? "hold",
                  weightEdited: false
                }
              ]
            };
          })
        }));
        setPersistenceError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to add set.";
        setPersistenceError(message);
      }
    })();
  };

  const updateExerciseNotes = (exerciseId: string, notes: string) => {
    setSession((previous) => ({
      ...previous,
      exercises: previous.exercises.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, notes } : exercise
      )
    }));
  };

  const addExerciseLink = (exerciseId: string, link: ExerciseLink) => {
    setSession((previous) => ({
      ...previous,
      exercises: previous.exercises.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, links: [...exercise.links, link] } : exercise
      )
    }));
  };

  const removeExerciseLink = (exerciseId: string, linkId: string) => {
    setSession((previous) => ({
      ...previous,
      exercises: previous.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? { ...exercise, links: exercise.links.filter((link) => link.id !== linkId) }
          : exercise
      )
    }));
  };

  const startRest = (exerciseId: string, setId: string, durationSeconds: number) => {
    setSession((previous) => ({
      ...previous,
      restTimer: {
        active: true,
        remainingSeconds: durationSeconds,
        exerciseId,
        setId
      }
    }));
  };

  const adjustRest = (deltaSeconds: number) => {
    setSession((previous) => {
      if (!previous.restTimer) {
        return previous;
      }

      const remaining = Math.max(previous.restTimer.remainingSeconds + deltaSeconds, 0);
      if (remaining === 0) {
        return { ...previous, restTimer: null };
      }

      return {
        ...previous,
        restTimer: { ...previous.restTimer, remainingSeconds: remaining }
      };
    });
  };

  const stopRest = () => {
    setSession((previous) => ({ ...previous, restTimer: null }));
  };

  const saveSet = async (payload: PersistSetPayload) => {
    await persistCompleteSet({
      workoutExerciseId: payload.workoutExerciseId,
      setId: payload.setId,
      setNumber: payload.setNumber,
      setType: payload.setType,
      weightLbs: payload.weightLbs,
      reps: payload.reps,
      completedAt: payload.completedAt
    });
  };

  const hasMoreExercisesFromTarget = (targetValue: DetailTarget) => {
    const targetIds = targetValue.type === "superset" && targetValue.supersetGroupId
      ? session.supersetGroups.find((group) => group.id === targetValue.supersetGroupId)?.exerciseIds ?? [targetValue.exerciseId]
      : [targetValue.exerciseId];

    return session.exercises.some(
      (exercise) => !isExerciseComplete(exercise) && !targetIds.includes(exercise.id)
    );
  };

  const inProgressRows = useMemo(() => {
    return buildGroupedRows(inProgressExercises);
  }, [inProgressExercises]);

  const completedRows = useMemo(() => {
    return buildGroupedRows(completedExercises);
  }, [completedExercises]);

  const getExerciseRowState = (exercise: WorkoutExercise): "complete" | "current" | "notStarted" => {
    if (isExerciseComplete(exercise)) {
      return "complete";
    }

    if (exercise.id === currentExerciseId) {
      return "current";
    }

    return "notStarted";
  };

  const getSupersetRowState = (
    first: WorkoutExercise,
    second: WorkoutExercise
  ): "complete" | "current" | "notStarted" => {
    const total = first.sets.length + second.sets.length;
    const completed = getCompletedSetCount(first) + getCompletedSetCount(second);
    if (total > 0 && completed >= total) {
      return "complete";
    }

    if (first.id === currentExerciseId || second.id === currentExerciseId) {
      return "current";
    }

    if (completed > 0) {
      return "current";
    }

    return "notStarted";
  };

  const getRowKey = (row: OverviewRow) => row.exerciseIds.join("|");

  const removeExercisesById = (ids: string[]) => {
    const toRemove = new Set(ids);
    const removedIds = session.exercises.filter((exercise) => toRemove.has(exercise.id)).map((exercise) => exercise.id);

    setSession((previous) => {
      const nextExercises = previous.exercises
        .filter((exercise) => !toRemove.has(exercise.id))
        .map((exercise, index) => ({ ...exercise, order: index + 1 }));
      const nextSupersets = previous.supersetGroups.filter((group) =>
        group.exerciseIds.every((exerciseId) => !toRemove.has(exerciseId))
      );

      return {
        ...previous,
        exercises: nextExercises,
        supersetGroups: nextSupersets
      };
    });

    void (async () => {
      try {
        await persistDeleteWorkoutExercises({
          sessionId: session.id,
          workoutExerciseIds: removedIds
        });
        setPersistenceError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete exercise.";
        setPersistenceError(message);
      }
    })();
  };

  const toggleRowSelection = (exerciseIds: string[]) => {
    setSelectedExerciseIds((previous) => {
      const selected = new Set(previous);
      const allSelected = exerciseIds.every((id) => selected.has(id));
      if (allSelected) {
        exerciseIds.forEach((id) => selected.delete(id));
      } else {
        exerciseIds.forEach((id) => selected.add(id));
      }

      return [...selected];
    });
  };

  const reorderInProgressRows = (sourceRowKey: string, targetRowKey: string) => {
    if (sourceRowKey === targetRowKey) {
      return;
    }

    const ordered = sortedExercises(session.exercises);
    const prevInProgress = ordered.filter((exercise) => !isExerciseComplete(exercise));
    const rows = buildGroupedRows(prevInProgress);
    const sourceIndex = rows.findIndex((row) => getRowKey(row) === sourceRowKey);
    const targetIndex = rows.findIndex((row) => getRowKey(row) === targetRowKey);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextRows = [...rows];
    const [moved] = nextRows.splice(sourceIndex, 1);
    nextRows.splice(targetIndex, 0, moved);
    const reorderedInProgressIds = nextRows.flatMap((row) => row.exerciseIds);

    let inProgressIndex = 0;
    const nextOrderIds = ordered.map((exercise) => {
      if (isExerciseComplete(exercise)) {
        return exercise.id;
      }

      const nextId = reorderedInProgressIds[inProgressIndex] ?? exercise.id;
      inProgressIndex += 1;
      return nextId;
    });

    const exerciseById = session.exercises.reduce<Record<string, WorkoutExercise>>((accumulator, exercise) => {
      accumulator[exercise.id] = exercise;
      return accumulator;
    }, {});

    const nextExercises: WorkoutExercise[] = [];
    nextOrderIds.forEach((id, index) => {
      const exercise = exerciseById[id];
      if (!exercise) {
        return;
      }

      nextExercises.push({
        ...exercise,
        order: index + 1
      });
    });

    if (nextExercises.length !== session.exercises.length) {
      return;
    }

    setSession((previous) => ({
      ...previous,
      exercises: nextExercises
    }));

    void (async () => {
      try {
        await persistReorderWorkoutExercises({
          sessionId: session.id,
          orderedWorkoutExerciseIds: nextExercises
            .slice()
            .sort((left, right) => left.order - right.order)
            .map((exercise) => exercise.id)
        });
        setPersistenceError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to reorder exercises.";
        setPersistenceError(message);
      }
    })();
  };

  const onPressDeleteSelected = () => {
    if (selectedExerciseIds.length === 0) {
      setEditMessage("Tap ✓ on exercises to select");
      window.setTimeout(() => setEditMessage(null), 1200);
      return;
    }

    removeExercisesById(selectedExerciseIds);
    setSelectedExerciseIds([]);
  };

  const openExerciseDeleteDialog = (exerciseIds: string[]) => {
    const labels = exerciseIds
      .map((id) => exercises.find((exercise) => exercise.id === id)?.name)
      .filter((name): name is string => Boolean(name));

    setExerciseDeleteDialog({
      exerciseIds,
      label: labels.join(" + ")
    });
  };

  const detailTargetContent = detailTarget ? (
    <ExerciseDetail
      session={session}
      preferences={preferences}
      target={detailTarget}
      hasMoreExercisesRemaining={hasMoreExercisesFromTarget(detailTarget)}
      isDesktop={isDesktop}
      onClose={() => setDetailTarget(null)}
      onAdvanceExercise={() => undefined}
      onFinishWorkout={() => {
        setDetailTarget(null);
        setStubScreen("session-summary");
      }}
      onSaveSet={async (payload) => {
        await saveSet(payload);
        updateSet(payload.workoutExerciseId, payload.setId, {
          completed: true,
          completedAt: payload.completedAt
        });
      }}
      onUpdateSet={updateSet}
      onDeleteSet={deleteSet}
      onAddSet={addSet}
      onUpdateExerciseNotes={updateExerciseNotes}
      onAddExerciseLink={addExerciseLink}
      onRemoveExerciseLink={removeExerciseLink}
      onStartRest={startRest}
      onAdjustRest={adjustRest}
      onStopRest={stopRest}
    />
  ) : null;

  if (isSessionLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#0d0d0d] px-4 text-center">
        <p className="font-data text-[13px] text-[#8a8478]">Loading active workout...</p>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#0d0d0d] px-4 text-center">
        <p className="font-data text-[13px] text-[#b84040]">{sessionError}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto h-dvh w-full max-w-[420px] bg-[#0d0d0d] text-[#e8e4dc]">
      <TimerStrip elapsedSeconds={session.elapsedSeconds} restActive={Boolean(session.restTimer?.active)} />

      <main
        className="h-dvh overflow-y-auto px-3 pt-[44px]"
        style={{ paddingBottom: "calc(60px + max(16px, env(safe-area-inset-bottom)))" }}
      >
        <header className="flex items-center gap-2 pb-[10px] pt-3">
          <h2 className="max-w-[45%] truncate font-display text-[22px] font-bold uppercase text-[#e8e4dc]">
            {exercises.length === 0 ? "" : session.name ?? ""}
          </h2>
          <p
            className="min-w-0 flex-1 truncate text-right font-data text-[13px] text-[#4a4740]"
            style={{ fontFamily: "DM Mono", fontSize: "13px", color: "#4a4740" }}
          >
            {muscleGroupText}
          </p>
        </header>

        {persistenceError ? (
          <p className="mb-2 font-data text-[12px] text-[#b84040]">{persistenceError}</p>
        ) : null}

        {session.restTimer?.active ? (
          <div className="mb-2 mt-0 rounded-[4px] border border-[#2e2e2e] border-l-[4px] border-l-[#c8922a] bg-[#2a1f0a] px-3 py-2">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-center">
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[#c8922a]">REST</span>
              <span className="font-data text-[18px] text-[#c8922a]">
                {Math.floor(session.restTimer.remainingSeconds / 60)
                  .toString()
                  .padStart(2, "0")}
                :
                {(session.restTimer.remainingSeconds % 60).toString().padStart(2, "0")}
              </span>
              <button type="button" onClick={stopRest} className="font-data text-[14px] text-[#8a8478]">
                ✕
              </button>
            </div>
          </div>
        ) : (
          <div className="h-2" />
        )}

        {completedExercises.length > 0 ? (
          <section className="mb-3">
            <h3 className="mb-2.5 border-l-2 border-[#c8922a] pl-2 font-display text-[11px] uppercase tracking-[0.08em] text-[#4a4740]">
              Completed
            </h3>
            <div className="overflow-hidden rounded-[4px] border-2 border-[#2e2e2e]">
              {completedRows.map((row) => {
                if (row.type === "single") {
                  const exercise = exercises.find((item) => item.id === row.exerciseIds[0]);
                  if (!exercise) {
                    return null;
                  }

                  return (
                    <ExerciseRow
                      key={exercise.id}
                      name={exercise.name}
                      setCount={getSetCount(exercise)}
                      weightText={getSuggestedWeightText(exercise)}
                      repsText={getSuggestedRepsText(exercise)}
                      arrow={getArrowFromExercise(exercise)}
                      rowState="complete"
                      isEditMode={false}
                      isSelected={false}
                      isDragging={false}
                      onPress={() =>
                        setDetailTarget({
                          type: "single",
                          exerciseId: exercise.id,
                          supersetGroupId: null
                        })
                      }
                      onActionPress={() => openExerciseDeleteDialog([exercise.id])}
                    />
                  );
                }

                const first = exercises.find((item) => item.id === row.exerciseIds[0]);
                const second = exercises.find((item) => item.id === row.exerciseIds[1]);
                if (!first || !second || !first.supersetGroupId) {
                  return null;
                }

                return (
                  <SupersetRow
                    key={`${first.id}-${second.id}`}
                    lineOne={{
                      name: first.name,
                      setCount: getSetCount(first),
                      weightText: getSuggestedWeightText(first),
                      repsText: getSuggestedRepsText(first),
                      arrow: getArrowFromExercise(first)
                    }}
                    lineTwo={{
                      name: second.name,
                      setCount: getSetCount(second),
                      weightText: getSuggestedWeightText(second),
                      repsText: getSuggestedRepsText(second),
                      arrow: getArrowFromExercise(second)
                    }}
                    rowState="complete"
                    isEditMode={false}
                    isSelected={false}
                    isDragging={false}
                    onPress={() =>
                      setDetailTarget({
                        type: "superset",
                        exerciseId: first.id,
                        supersetGroupId: first.supersetGroupId
                      })
                    }
                    onActionPress={() => openExerciseDeleteDialog([first.id, second.id])}
                  />
                );
              })}
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-2.5 flex items-center justify-between">
            {completedExercises.length > 0 ? (
              <h3 className="border-l-2 border-[#c8922a] pl-2 font-display text-[11px] uppercase tracking-[0.08em] text-[#4a4740]">
                In Progress
              </h3>
            ) : (
              <span />
            )}

            {isEditMode ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onPressDeleteSelected}
                  className="font-microgramma font-display text-[12px] font-medium uppercase tracking-[0.08em] text-[#b84040]"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditMode(false);
                    setSelectedExerciseIds([]);
                    setDraggingRowKey(null);
                    setEditMessage(null);
                  }}
                  className="font-microgramma font-display text-[12px] font-medium uppercase tracking-[0.08em] text-[#4a9e6b]"
                >
                  Done
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsEditMode(true);
                  setSelectedExerciseIds([]);
                  setEditMessage(null);
                }}
                className="font-microgramma bg-transparent font-display text-[12px] font-medium uppercase tracking-[0.08em] text-[#8a8478]"
              >
                Edit
              </button>
            )}
          </div>

          {editMessage ? (
            <p className="mb-1.5 font-data text-[12px] text-[#8a8478]">{editMessage}</p>
          ) : null}

          <div className="overflow-hidden rounded-[4px] border-2 border-[#2e2e2e]">
            {inProgressRows.map((row) => {
              const rowKey = getRowKey(row);
              const rowSelected = row.exerciseIds.every((exerciseId) => selectedExerciseIds.includes(exerciseId));

              if (row.type === "single") {
                const exercise = exercises.find((item) => item.id === row.exerciseIds[0]);
                if (!exercise) {
                  return null;
                }

                return (
                  <ExerciseRow
                    key={exercise.id}
                    name={exercise.name}
                    setCount={getSetCount(exercise)}
                    weightText={getSuggestedWeightText(exercise)}
                    repsText={getSuggestedRepsText(exercise)}
                    arrow={getArrowFromExercise(exercise)}
                    rowState={getExerciseRowState(exercise)}
                    isEditMode={isEditMode}
                    isSelected={rowSelected}
                    isDragging={draggingRowKey === rowKey}
                    onPress={() =>
                      setDetailTarget({
                        type: "single",
                        exerciseId: exercise.id,
                        supersetGroupId: null
                      })
                    }
                    onActionPress={() => {
                      if (isEditMode) {
                        toggleRowSelection([exercise.id]);
                        return;
                      }

                      openExerciseDeleteDialog([exercise.id]);
                    }}
                    onDragStart={() => setDraggingRowKey(rowKey)}
                    onDragEnd={() => setDraggingRowKey(null)}
                    onDragOver={(event) => {
                      if (!isEditMode) {
                        return;
                      }

                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      if (!isEditMode || !draggingRowKey) {
                        return;
                      }

                      event.preventDefault();
                      reorderInProgressRows(draggingRowKey, rowKey);
                      setDraggingRowKey(null);
                    }}
                  />
                );
              }

              const first = exercises.find((item) => item.id === row.exerciseIds[0]);
              const second = exercises.find((item) => item.id === row.exerciseIds[1]);
              if (!first || !second || !first.supersetGroupId) {
                return null;
              }

              return (
                <SupersetRow
                  key={`${first.id}-${second.id}`}
                  lineOne={{
                    name: first.name,
                    setCount: getSetCount(first),
                    weightText: getSuggestedWeightText(first),
                    repsText: getSuggestedRepsText(first),
                    arrow: getArrowFromExercise(first)
                  }}
                  lineTwo={{
                    name: second.name,
                    setCount: getSetCount(second),
                    weightText: getSuggestedWeightText(second),
                    repsText: getSuggestedRepsText(second),
                    arrow: getArrowFromExercise(second)
                  }}
                  rowState={getSupersetRowState(first, second)}
                  isEditMode={isEditMode}
                  isSelected={rowSelected}
                  isDragging={draggingRowKey === rowKey}
                  onPress={() =>
                    setDetailTarget({
                      type: "superset",
                      exerciseId: first.id,
                      supersetGroupId: first.supersetGroupId
                    })
                  }
                  onActionPress={() => {
                    if (isEditMode) {
                      toggleRowSelection([first.id, second.id]);
                      return;
                    }

                    openExerciseDeleteDialog([first.id, second.id]);
                  }}
                  onDragStart={() => setDraggingRowKey(rowKey)}
                  onDragEnd={() => setDraggingRowKey(null)}
                  onDragOver={(event) => {
                    if (!isEditMode) {
                      return;
                    }

                    event.preventDefault();
                  }}
                  onDrop={(event) => {
                    if (!isEditMode || !draggingRowKey) {
                      return;
                    }

                    event.preventDefault();
                    reorderInProgressRows(draggingRowKey, rowKey);
                    setDraggingRowKey(null);
                  }}
                />
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setStubScreen("exercise-browser")}
            className="mt-3 h-12 w-full rounded-[4px] border border-[#2e2e2e] bg-transparent font-display text-[13px] font-bold uppercase tracking-[0.08em] text-[#8a8478]"
            style={{ fontFamily: "Microgramma" }}
          >
            + Add Exercise
          </button>
        </section>
      </main>

      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-[#2e2e2e] bg-[#c8922a]"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto w-full max-w-[420px]">
          <button
            type="button"
            onClick={() => setShowFinishConfirm(true)}
            className="h-[60px] w-full border-2 border-[#8a6219] font-display text-[18px] font-bold uppercase tracking-[0.08em] text-[#0d0d0d]"
          >
            Finish Session
          </button>
        </div>
      </div>

      {detailTarget && !isDesktop ? (
        <div className="fixed inset-0 z-[60] bg-[#0d0d0d]">{detailTargetContent}</div>
      ) : null}

      {detailTarget && isDesktop ? (
        <ExerciseDetailSheet open={Boolean(detailTarget)} onClose={() => setDetailTarget(null)}>
          {detailTargetContent}
        </ExerciseDetailSheet>
      ) : null}

      {exerciseDeleteDialog ? (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-[rgba(0,0,0,0.6)] px-4"
          onClick={() => setExerciseDeleteDialog(null)}
        >
          <div
            className="w-full max-w-[280px] rounded-[6px] border border-[#2e2e2e] bg-[#1c1c1c] px-6 py-5"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="font-display text-[18px] font-bold uppercase text-[#e8e4dc]">Remove Exercise</h3>
            <p className="mt-2 font-data text-[13px] text-[#8a8478]">
              Remove {exerciseDeleteDialog.label} from this session?
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setExerciseDeleteDialog(null)}
                className="h-10 flex-1 rounded-[4px] border border-[#2e2e2e] bg-transparent font-display text-[14px] font-semibold uppercase tracking-[0.08em] text-[#8a8478]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  removeExercisesById(exerciseDeleteDialog.exerciseIds);
                  setExerciseDeleteDialog(null);
                }}
                className="h-10 flex-1 rounded-[4px] bg-[#b84040] font-display text-[14px] font-bold uppercase tracking-[0.08em] text-white"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showFinishConfirm ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-[320px] rounded-[4px] border border-[#2e2e2e] bg-[#141414] p-4">
            <p className="font-data text-[14px] text-[#8a8478]">
              End this session? All logged sets will be saved.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowFinishConfirm(false)}
                className="h-8 rounded-[4px] border border-[#2e2e2e] px-3 font-display text-[12px] uppercase tracking-[0.08em] text-[#8a8478]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFinishConfirm(false);
                  setStubScreen("session-summary");
                }}
                className="h-8 rounded-[4px] bg-[#b84040] px-3 font-display text-[12px] uppercase tracking-[0.08em] text-white"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {stubScreen ? (
        <div className="fixed inset-0 z-[90] bg-[#0d0d0d] px-3 py-4">
          <button
            type="button"
            onClick={() => setStubScreen(null)}
            className="mb-3 inline-flex items-center gap-2 rounded-[3px] border-2 border-[#2e2e2e] px-[14px] py-[6px] font-display text-[14px] font-bold uppercase tracking-[0.08em] text-[#8a8478] hover:border-[#c8922a] hover:text-[#c8922a]"
          >
            <span className="font-data text-[16px]">←</span>
            BACK
          </button>
          <div className="rounded-[4px] border-2 border-[#2e2e2e] bg-[#141414] p-4">
            <h2 className="mb-4 font-display text-[18px] uppercase text-[#e8e4dc]">
              {stubScreen === "exercise-browser" ? "Exercise Browser" : "Session Summary"}
            </h2>
            <p className="mt-2 font-data text-[13px] text-[#8a8478]">Placeholder screen stub.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
};
