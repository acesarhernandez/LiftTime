"use client";

import { cn } from "@/shared/lib/utils";
import { WorkoutSelectionMode, WorkoutTrainingGoal } from "@/features/workout-builder/types";

interface SelectionModeOption {
  id: WorkoutSelectionMode;
  title: string;
  description: string;
}

interface TrainingGoalOption {
  id: WorkoutTrainingGoal;
  title: string;
  description: string;
}

const SELECTION_MODE_OPTIONS: SelectionModeOption[] = [
  {
    id: "equipment_muscles",
    title: "Equipment + Muscles",
    description: "Pick equipment, target muscles, then get a balanced exercise list."
  },
  {
    id: "equipment_only",
    title: "Equipment Only",
    description: "Skip muscle selection and build a full workout using available equipment."
  },
  {
    id: "individual",
    title: "Pick Individually",
    description: "Choose exercises one by one from the filtered equipment library."
  }
];

const TRAINING_GOAL_OPTIONS: TrainingGoalOption[] = [
  {
    id: "STRENGTH",
    title: "Strength",
    description: "Lower reps, heavier loads, and longer rest periods (~150s default)."
  },
  {
    id: "HYPERTROPHY",
    title: "Hypertrophy",
    description: "Moderate reps/load for muscle growth with moderate rest (~90s default)."
  },
  {
    id: "ENDURANCE",
    title: "Endurance / Toning",
    description: "Higher reps, lighter loads, and shorter rest (~60s default)."
  }
];

export function WorkoutPreferencesPanel({
  selectionMode,
  trainingGoal,
  onSelectionModeChange,
  onTrainingGoalChange,
  showSelectionMode = true
}: {
  selectionMode: WorkoutSelectionMode;
  trainingGoal: WorkoutTrainingGoal;
  onSelectionModeChange: (mode: WorkoutSelectionMode) => void;
  onTrainingGoalChange: (goal: WorkoutTrainingGoal) => void;
  showSelectionMode?: boolean;
}) {
  return (
    <div className="space-y-5 rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
      {showSelectionMode && (
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Workout Build Style</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Choose how exercises are selected for this session.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {SELECTION_MODE_OPTIONS.map((option) => {
              const isSelected = option.id === selectionMode;
              return (
                <button
                  className={cn(
                    "text-left rounded-lg border px-3 py-3 transition-colors",
                    isSelected
                      ? "border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100"
                      : "border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  )}
                  key={option.id}
                  onClick={() => onSelectionModeChange(option.id)}
                  type="button"
                >
                  <div className="font-medium">{option.title}</div>
                  <div className="text-xs mt-1 opacity-80">{option.description}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Training Goal</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">This controls recommended reps, sets, and progression style.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {TRAINING_GOAL_OPTIONS.map((option) => {
            const isSelected = option.id === trainingGoal;
            return (
              <button
                className={cn(
                  "text-left rounded-lg border px-3 py-3 transition-colors",
                  isSelected
                    ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                    : "border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                )}
                key={option.id}
                onClick={() => onTrainingGoalChange(option.id)}
                type="button"
              >
                <div className="font-medium">{option.title}</div>
                <div className="text-xs mt-1 opacity-80">{option.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100">
        <p className="font-semibold">How auto-populate works</p>
        <p className="mt-1">
          Recommendations start from your recent completed sets for the same exercise. The system uses double progression: progress reps
          within the target range first, then increase load in small steps once rep quality is stable.
        </p>
        <p className="mt-1">
          Weekly set volume is used as a fatigue proxy. If a muscle group is already above its weekly target range, recommendation volume is
          reduced. If volume is below target and performance is consistent, one working set can be added.
        </p>
        <p className="mt-1">
          Load jumps are rounded to practical gym increments (plates/dumbbells), and your selected goal sets the default rest interval after
          each completed set.
        </p>
      </div>
    </div>
  );
}
