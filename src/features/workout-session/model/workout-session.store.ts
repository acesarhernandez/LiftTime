import { create } from "zustand";

import { workoutSessionLocal } from "@/shared/lib/workout-session/workout-session.local";
import { WorkoutSession } from "@/shared/lib/workout-session/types/workout-session";
import { convertWeight, type WeightUnit } from "@/shared/lib/weight-conversion";
import { LastExercisePerformance, SuggestedWorkoutSet, WorkoutSessionExercise, WorkoutSet, WorkoutSetType, WorkoutSetUnit } from "@/features/workout-session/types/workout-set";
import { BeginnerEffortGrade, TrainingMode, beginnerEffortToRir } from "@/features/workout-session/types/training-mode";
import { useWorkoutBuilderStore } from "@/features/workout-builder/model/workout-builder.store";
import { ExerciseWithAttributes } from "@/entities/exercise/types/exercise.types";

interface WorkoutSessionProgress {
  exerciseId: string;
  sets: {
    reps: number;
    weight?: number;
    duration?: number;
  }[];
  completed: boolean;
}

interface ActiveRestTimer {
  endsAt: number;
  durationSec: number;
  goal: "STRENGTH" | "HYPERTROPHY" | "ENDURANCE";
  finishedAt?: number | null;
}

interface WorkoutSessionState {
  session: WorkoutSession | null;
  progress: Record<string, WorkoutSessionProgress>;
  elapsedTime: number;
  isTimerRunning: boolean;
  isWorkoutActive: boolean;
  restTimer: ActiveRestTimer | null;
  currentExerciseIndex: number;
  currentExercise: WorkoutSessionExercise | null;

  // Progression
  exercisesCompleted: number;
  totalExercises: number;
  progressPercent: number;

  // Actions
  startWorkout: (
    exercises: ExerciseWithAttributes[] | WorkoutSessionExercise[],
    equipment: any[],
    muscles: any[],
    suggestedSetsByExerciseId?: Record<string, SuggestedWorkoutSet[]>,
    trainingGoal?: "STRENGTH" | "HYPERTROPHY" | "ENDURANCE",
    lastPerformanceByExerciseId?: Record<string, LastExercisePerformance>,
    trainingMode?: TrainingMode
  ) => void;
  quitWorkout: () => void;
  completeWorkout: () => void;
  toggleTimer: () => void;
  resetTimer: () => void;
  setElapsedTime: (seconds: number) => void;
  startRestTimer: (durationSec: number, goal: "STRENGTH" | "HYPERTROPHY" | "ENDURANCE") => void;
  cancelRestTimer: () => void;
  completeRestTimer: () => void;
  applyBeginnerEffortGrades: (effortByExerciseId: Partial<Record<string, BeginnerEffortGrade>>) => void;
  updateExerciseProgress: (exerciseId: string, progressData: Partial<WorkoutSessionProgress>) => void;
  addSet: () => void;
  updateSet: (exerciseIndex: number, setIndex: number, data: Partial<WorkoutSet>) => void;
  removeSet: (exerciseIndex: number, setIndex: number) => void;
  finishSet: (exerciseIndex: number, setIndex: number) => void;
  goToNextExercise: () => void;
  goToPrevExercise: () => void;
  goToExercise: (targetIndex: number) => void;
  formatElapsedTime: () => string;
  getExercisesCompleted: () => number;
  getTotalExercises: () => number;
  getTotalVolume: () => number;
  getTotalVolumeInUnit: (unit: WeightUnit) => number;
  loadSessionFromLocal: () => void;
  addExerciseToSession: (exercise: ExerciseWithAttributes) => void;
}

export const useWorkoutSessionStore = create<WorkoutSessionState>((set, get) => ({
  session: null,
  progress: {},
  elapsedTime: 0,
  isTimerRunning: false,
  isWorkoutActive: false,
  restTimer: null,
  currentExerciseIndex: 0,
  currentExercise: null,
  exercisesCompleted: 0,
  totalExercises: 0,
  progressPercent: 0,

  startWorkout: (exercises, _equipment, muscles, suggestedSetsByExerciseId, trainingGoal, lastPerformanceByExerciseId, trainingMode) => {
    const sessionExercises: WorkoutSessionExercise[] = exercises.map((ex, idx) => {
      const lastPerformance = lastPerformanceByExerciseId?.[ex.id] ?? null;

      // Check if exercise already has sets (from program)
      if ("sets" in ex && ex.sets && ex.sets.length > 0) {
        return {
          ...ex,
          order: idx,
          lastPerformance,
        } as WorkoutSessionExercise;
      }

      const suggestedSets = suggestedSetsByExerciseId?.[ex.id];
      if (suggestedSets?.length) {
        const sets: WorkoutSet[] = suggestedSets.map((s, i) => ({
          id: `${ex.id}-set-${i + 1}`,
          setIndex: s.setIndex,
          type: s.type ?? "NORMAL",
          types: s.types,
          valuesInt: s.valuesInt ?? [],
          valuesSec: s.valuesSec ?? [],
          units: s.units ?? [],
          recommendationReason: s.recommendationReason,
          rir: s.rir ?? null,
          painLevel: s.painLevel ?? null,
          completed: false,
        }));
        return {
          ...ex,
          order: idx,
          lastPerformance,
          sets,
        } as WorkoutSessionExercise;
      }

      // Default sets for custom workouts (no history / not logged in)
      return {
        ...ex,
        order: idx,
        lastPerformance,
        sets: [
          {
            id: `${ex.id}-set-1`,
            setIndex: 0,
            type: "NORMAL",
            types: ["REPS", "WEIGHT"],
            valuesInt: [],
            valuesSec: [],
            units: [],
            painLevel: null,
            completed: false,
          },
        ],
      } as WorkoutSessionExercise;
    });

    const newSession: WorkoutSession = {
      id: Date.now().toString(),
      userId: "local",
      startedAt: new Date().toISOString(),
      exercises: sessionExercises,
      trainingGoal: trainingGoal ?? "HYPERTROPHY",
      trainingMode: trainingMode ?? "BEGINNER",
      status: "active",
      muscles,
    };

    workoutSessionLocal.add(newSession);
    workoutSessionLocal.setCurrent(newSession.id);

    set({
      session: newSession,
      elapsedTime: 0,
      isTimerRunning: false,
      isWorkoutActive: true,
      restTimer: null,
      currentExerciseIndex: 0,
      currentExercise: sessionExercises[0],
    });
  },

  quitWorkout: () => {
    const { session } = get();
    if (session) {
      workoutSessionLocal.remove(session.id);
    }
    set({
      session: null,
      progress: {},
      elapsedTime: 0,
      isTimerRunning: false,
      isWorkoutActive: false,
      restTimer: null,
      currentExerciseIndex: 0,
      currentExercise: null,
    });
  },

  completeWorkout: () => {
    const { session } = get();

    if (session) {
      workoutSessionLocal.update(session.id, { status: "completed", endedAt: new Date().toISOString() });
      console.log({
        session: { ...session, status: "completed", endedAt: new Date().toISOString() },
        progress: {},
        elapsedTime: 0,
        isTimerRunning: false,
        isWorkoutActive: false,
      });
      set({
        session: { ...session, status: "completed", endedAt: new Date().toISOString() },
        progress: {},
        elapsedTime: 0,
        isTimerRunning: false,
        isWorkoutActive: false,
        restTimer: null,
      });
    }

    useWorkoutBuilderStore.getState().setStep(1);
  },

  toggleTimer: () => {
    set((state) => {
      const newIsRunning = !state.isTimerRunning;
      if (state.session) {
        workoutSessionLocal.update(state.session.id, { isActive: newIsRunning });
      }
      return { isTimerRunning: newIsRunning };
    });
  },

  resetTimer: () => {
    set((state) => {
      if (state.session) {
        workoutSessionLocal.update(state.session.id, { duration: 0 });
      }
      return { elapsedTime: 0 };
    });
  },

  setElapsedTime: (seconds) => {
    set((state) => {
      if (!state.session) {
        return { elapsedTime: seconds };
      }

      workoutSessionLocal.update(state.session.id, { duration: seconds });
      return { elapsedTime: seconds };
    });
  },

  startRestTimer: (durationSec, goal) => {
    set({
      restTimer: {
        endsAt: Date.now() + durationSec * 1000,
        durationSec,
        goal,
        finishedAt: null
      }
    });
  },

  cancelRestTimer: () => {
    set({ restTimer: null });
  },

  completeRestTimer: () => {
    set((state) => {
      if (!state.restTimer || state.restTimer.finishedAt) {
        return state;
      }

      return {
        restTimer: {
          ...state.restTimer,
          finishedAt: Date.now()
        }
      };
    });
  },

  applyBeginnerEffortGrades: (effortByExerciseId) => {
    const { session } = get();
    if (!session) {
      return;
    }

    const updatedExercises = session.exercises.map((exercise) => {
      const effortGrade = effortByExerciseId[exercise.id];
      if (!effortGrade) {
        return exercise;
      }

      const rirValue = beginnerEffortToRir[effortGrade];
      const updatedSets = exercise.sets.map((set) => {
        if (!set.completed || set.type === "WARMUP" || typeof set.rir === "number") {
          return set;
        }

        return {
          ...set,
          rir: rirValue
        };
      });

      return {
        ...exercise,
        sets: updatedSets
      };
    });

    const updatedSession: WorkoutSession = {
      ...session,
      exercises: updatedExercises,
      beginnerEffortByExerciseId: {
        ...(session.beginnerEffortByExerciseId ?? {}),
        ...effortByExerciseId
      }
    };

    workoutSessionLocal.update(session.id, {
      exercises: updatedExercises,
      beginnerEffortByExerciseId: updatedSession.beginnerEffortByExerciseId
    });

    set({
      session: updatedSession,
      currentExercise: updatedExercises[get().currentExerciseIndex]
    });
  },

  updateExerciseProgress: (exerciseId, progressData) => {
    set((state) => ({
      progress: {
        ...state.progress,
        [exerciseId]: {
          ...state.progress[exerciseId],
          exerciseId,
          sets: [],
          completed: false,
          ...progressData,
        },
      },
    }));
  },

  addSet: () => {
    const { session, currentExerciseIndex } = get();
    if (!session) return;

    const exIdx = currentExerciseIndex;
    const currentExercise = session.exercises[exIdx];
    const sets = currentExercise.sets;

    const latestWorkingTemplate =
      [...sets].reverse().find((set) => (set.type ?? "NORMAL") !== "WARMUP") ?? sets[sets.length - 1];

    let typesToCopy: WorkoutSetType[] = ["REPS", "WEIGHT"];
    let unitsToCopy: WorkoutSetUnit[] = [];
    let valuesIntToCopy: number[] = [];
    let valuesSecToCopy: number[] = [];

    if (latestWorkingTemplate) {
      if (latestWorkingTemplate.types && latestWorkingTemplate.types.length > 0) {
        typesToCopy = [...latestWorkingTemplate.types];
      }

      if (latestWorkingTemplate.units && latestWorkingTemplate.units.length > 0) {
        unitsToCopy = [...latestWorkingTemplate.units];
      }

      valuesIntToCopy = Array.isArray(latestWorkingTemplate.valuesInt) ? [...latestWorkingTemplate.valuesInt] : [];
      valuesSecToCopy = Array.isArray(latestWorkingTemplate.valuesSec) ? [...latestWorkingTemplate.valuesSec] : [];
    }

    const newSet: WorkoutSet = {
      id: `${currentExercise.id}-set-${sets.length + 1}`,
      setIndex: sets.length,
      type: (latestWorkingTemplate?.type ?? "NORMAL") === "WARMUP" ? "NORMAL" : latestWorkingTemplate?.type ?? "NORMAL",
      types: typesToCopy,
      valuesInt: valuesIntToCopy,
      valuesSec: valuesSecToCopy,
      units: unitsToCopy,
      painLevel: null,
      completed: false,
    };

    const updatedExercises = session.exercises.map((ex, idx) => (idx === exIdx ? { ...ex, sets: [...ex.sets, newSet] } : ex));

    workoutSessionLocal.update(session.id, { exercises: updatedExercises });

    set({
      session: { ...session, exercises: updatedExercises },
      currentExercise: { ...updatedExercises[exIdx] },
    });
  },

  updateSet: (exerciseIndex, setIndex, data) => {
    const { session } = get();
    if (!session) return;

    const targetExercise = session.exercises[exerciseIndex];
    if (!targetExercise) return;

    const updatedSets = targetExercise.sets.map((set, idx) => (idx === setIndex ? { ...set, ...data } : set));
    const updatedExercises = session.exercises.map((ex, idx) => (idx === exerciseIndex ? { ...ex, sets: updatedSets } : ex));

    workoutSessionLocal.update(session.id, { exercises: updatedExercises });

    set({
      session: { ...session, exercises: updatedExercises },
      currentExercise: { ...updatedExercises[exerciseIndex] },
    });

    // handle exercisesCompleted
  },

  removeSet: (exerciseIndex, setIndex) => {
    const { session } = get();
    if (!session) return;
    const targetExercise = session.exercises[exerciseIndex];
    if (!targetExercise) return;
    const updatedSets = targetExercise.sets.filter((_, idx) => idx !== setIndex);
    const updatedExercises = session.exercises.map((ex, idx) => (idx === exerciseIndex ? { ...ex, sets: updatedSets } : ex));
    workoutSessionLocal.update(session.id, { exercises: updatedExercises });
    set({
      session: { ...session, exercises: updatedExercises },
      currentExercise: { ...updatedExercises[exerciseIndex] },
    });
  },

  finishSet: (exerciseIndex, setIndex) => {
    get().updateSet(exerciseIndex, setIndex, { completed: true });

    // if has completed all sets, go to next exercise
    const { session } = get();
    if (!session) return;

    const exercise = session.exercises[exerciseIndex];
    if (!exercise) return;

    if (exercise.sets.every((set) => set.completed)) {
      // get().goToNextExercise();
      // update exercisesCompleted
      const exercisesCompleted = get().exercisesCompleted;
      set({ exercisesCompleted: exercisesCompleted + 1 });
    }
  },

  goToNextExercise: () => {
    const { session, currentExerciseIndex } = get();
    if (!session) return;
    const idx = currentExerciseIndex;
    if (idx < session.exercises.length - 1) {
      workoutSessionLocal.update(session.id, { currentExerciseIndex: idx + 1 });
      set({
        currentExerciseIndex: idx + 1,
        currentExercise: session.exercises[idx + 1],
      });
    }
  },

  goToPrevExercise: () => {
    const { session, currentExerciseIndex } = get();
    if (!session) return;
    const idx = currentExerciseIndex;
    if (idx > 0) {
      workoutSessionLocal.update(session.id, { currentExerciseIndex: idx - 1 });
      set({
        currentExerciseIndex: idx - 1,
        currentExercise: session.exercises[idx - 1],
      });
    }
  },

  goToExercise: (targetIndex) => {
    const { session } = get();
    if (!session) return;
    if (targetIndex >= 0 && targetIndex < session.exercises.length) {
      workoutSessionLocal.update(session.id, { currentExerciseIndex: targetIndex });
      set({
        currentExerciseIndex: targetIndex,
        currentExercise: session.exercises[targetIndex],
      });
    }
  },

  getExercisesCompleted: () => {
    const { session } = get();
    if (!session) return 0;

    // only count exercises with at least one set
    return session.exercises
      .filter((exercise) => exercise.sets.length > 0)
      .filter((exercise) => exercise.sets.every((set) => set.completed)).length;
  },

  getTotalExercises: () => {
    const { session } = get();
    if (!session) return 0;
    return session.exercises.length;
  },

  getTotalVolume: () => {
    const { session } = get();
    if (!session) return 0;

    let totalVolume = 0;

    session.exercises.forEach((exercise) => {
      exercise.sets.forEach((set) => {
        // Vérifier si le set est complété et contient REPS et WEIGHT
        if (set.completed && set.types.includes("REPS") && set.types.includes("WEIGHT") && set.valuesInt) {
          const repsIndex = set.types.indexOf("REPS");
          const weightIndex = set.types.indexOf("WEIGHT");

          const reps = set.valuesInt[repsIndex] || 0;
          const weight = set.valuesInt[weightIndex] || 0;

          // Convertir les livres en kg si nécessaire
          const weightInKg =
            set.units && set.units[weightIndex] === "lbs"
              ? weight * 0.453592 // 1 lb = 0.453592 kg
              : weight;

          totalVolume += reps * weightInKg;
        }
      });
    });

    return Math.round(totalVolume);
  },

  getTotalVolumeInUnit: (unit: WeightUnit) => {
    const { session } = get();
    if (!session) return 0;

    let totalVolume = 0;

    session.exercises.forEach((exercise) => {
      exercise.sets.forEach((set) => {
        // Vérifier si le set est complété et contient REPS et WEIGHT
        if (set.completed && set.types.includes("REPS") && set.types.includes("WEIGHT") && set.valuesInt) {
          const repsIndex = set.types.indexOf("REPS");
          const weightIndex = set.types.indexOf("WEIGHT");

          const reps = set.valuesInt[repsIndex] || 0;
          const weight = set.valuesInt[weightIndex] || 0;

          // Déterminer l'unité de poids originale de la série
          const originalUnit: WeightUnit = set.units && set.units[weightIndex] === "lbs" ? "lbs" : "kg";

          // Convertir vers l'unité demandée
          const convertedWeight = convertWeight(weight, originalUnit, unit);

          totalVolume += reps * convertedWeight;
        }
      });
    });

    return Math.round(totalVolume * 10) / 10; // Arrondir à 1 décimale
  },

  formatElapsedTime: () => {
    const { elapsedTime } = get();
    const hours = Math.floor(elapsedTime / 3600);
    const minutes = Math.floor((elapsedTime % 3600) / 60);
    const secs = elapsedTime % 60;
    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  },

  loadSessionFromLocal: () => {
    const currentId = workoutSessionLocal.getCurrent();
    if (currentId) {
      const session = workoutSessionLocal.getById(currentId);
      if (session && session.status === "active") {
        set({
          session,
          isWorkoutActive: true,
          currentExerciseIndex: session.currentExerciseIndex ?? 0,
          currentExercise: session.exercises[session.currentExerciseIndex ?? 0],
          elapsedTime: session.duration ?? 0,
          isTimerRunning: false,
          restTimer: null
        });
      }
    }
  },

  addExerciseToSession: (exercise) => {
    const { session } = get();

    if (!session) {
      return;
    }

    // Create new exercise with default sets
    const newExercise: WorkoutSessionExercise = {
      ...exercise,
      order: session.exercises.length,
      sets: [
        {
          id: `${exercise.id}-set-1`,
          setIndex: 0,
          type: "NORMAL",
          types: ["REPS", "WEIGHT"],
          valuesInt: [],
          valuesSec: [],
          units: [],
          painLevel: null,
          completed: false,
        },
      ],
    };

    // Check if exercise already exists to avoid duplicates
    const exerciseExists = session.exercises.some((ex) => ex.id === exercise.id);
    if (exerciseExists) {
      console.log("🟡 [WORKOUT-SESSION] Exercise already exists in session, skipping add");
      return;
    }

    const updatedExercises = [...session.exercises, newExercise];
    const updatedSession = { ...session, exercises: updatedExercises };

    // Update local storage
    workoutSessionLocal.update(session.id, { exercises: updatedExercises });

    // Update state
    set({ session: updatedSession });

    console.log("🟡 [WORKOUT-SESSION] Exercise added successfully to session");
  },
}));
