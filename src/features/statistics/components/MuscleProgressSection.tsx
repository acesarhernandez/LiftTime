"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Dumbbell, Info } from "lucide-react";
import { ExerciseAttributeValueEnum } from "@prisma/client";

import { useI18n } from "locales/client";

import { getAttributeValueLabel } from "@/shared/lib/attribute-value-translation";
import { StatisticsTimeframe } from "@/shared/constants/statistics";
import { cn } from "@/shared/lib/utils";
import { useMuscleProgress } from "@/features/statistics/hooks/use-muscle-progress";

type Goal = "STRENGTH" | "HYPERTROPHY" | "ENDURANCE";

const goalDescriptions: Record<Goal, string> = {
  STRENGTH: "Lower reps and heavier loads. Targets strength-focused weekly set ranges.",
  HYPERTROPHY: "Moderate reps and enough weekly volume to drive muscle growth.",
  ENDURANCE: "Higher reps and lighter loads to build muscular endurance."
};

const fatigueBadgeStyles = {
  LOW: "bg-amber-100 text-amber-900 border-amber-300",
  TARGET: "bg-emerald-100 text-emerald-900 border-emerald-300",
  HIGH: "bg-rose-100 text-rose-900 border-rose-300"
} as const;

const fatigueLabels = {
  LOW: "Under target",
  TARGET: "In target",
  HIGH: "High fatigue"
} as const;

export function MuscleProgressSection({ timeframe, isPremium }: { timeframe: StatisticsTimeframe; isPremium: boolean }) {
  const t = useI18n();
  const [goal, setGoal] = useState<Goal>("HYPERTROPHY");
  const muscleProgressQuery = useMuscleProgress(timeframe, goal, isPremium);

  const muscles = useMemo(() => muscleProgressQuery.data?.muscles ?? [], [muscleProgressQuery.data?.muscles]);

  if (!isPremium) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/70">
        <div className="flex items-start gap-3">
          <Dumbbell className="h-5 w-5 text-slate-500 mt-0.5" />
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Muscle Progress</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Track weekly muscle workload, fatigue status, and top contributing exercises.
            </p>
            <Link className="mt-3 inline-flex text-sm font-medium text-blue-600 hover:text-blue-700" href="/premium">
              Upgrade to unlock muscle progress analytics
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/70 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Muscle Progress</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">Weekly effective sets and fatigue-aware progression signals.</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(["STRENGTH", "HYPERTROPHY", "ENDURANCE"] as Goal[]).map((goalOption) => {
            const isSelected = goalOption === goal;
            return (
              <button
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium",
                  isSelected
                    ? "border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-100"
                    : "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                )}
                key={goalOption}
                onClick={() => setGoal(goalOption)}
                type="button"
              >
                {goalOption}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">{goalDescriptions[goal]}</p>

      {muscleProgressQuery.isLoading && (
        <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">
          Loading muscle progress...
        </div>
      )}

      {muscleProgressQuery.isError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Failed to load muscle progress
          </div>
        </div>
      )}

      {!muscleProgressQuery.isLoading && !muscleProgressQuery.isError && muscles.length === 0 && (
        <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">
          No completed training data yet. Finish sessions and this dashboard will populate automatically.
        </div>
      )}

      {muscles.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {muscles.map((musclePoint) => {
            const muscleLabel = getAttributeValueLabel(musclePoint.muscle as ExerciseAttributeValueEnum, t);
            const progressPercent = Math.min(100, Math.max(0, (musclePoint.currentWeekEffectiveSets / musclePoint.targetMaxSets) * 100));
            const weeklyTrend = musclePoint.weekly.slice(-4);

            return (
              <article className="rounded-lg border border-slate-200 p-3 dark:border-slate-700" key={musclePoint.muscle}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100">{muscleLabel}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {musclePoint.currentWeekEffectiveSets} sets this week
                    </p>
                  </div>

                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                      fatigueBadgeStyles[musclePoint.fatigueStatus]
                    )}
                  >
                    {fatigueLabels[musclePoint.fatigueStatus]}
                  </span>
                </div>

                <div className="mt-2">
                  <div className="mb-1 flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>
                      Target {musclePoint.targetMinSets}-{musclePoint.targetMaxSets} sets
                    </span>
                    <span>{musclePoint.currentWeekEffectiveSets.toFixed(1)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-2 rounded-full bg-blue-500" style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>

                {musclePoint.topExercises.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Top contributors</p>
                    <div className="mt-1 space-y-1">
                      {musclePoint.topExercises.map((exercise) => (
                        <div className="flex items-center justify-between text-xs" key={`${musclePoint.muscle}-${exercise.exerciseId}`}>
                          <span className="text-slate-700 dark:text-slate-200 truncate pr-2">{exercise.exerciseName}</span>
                          <span className="text-slate-500 dark:text-slate-400">{exercise.effectiveSets.toFixed(1)} sets</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {weeklyTrend.length > 1 && (
                  <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                    4-week trend: {weeklyTrend.map((point) => `${point.weekStart.slice(5)} (${point.effectiveSets})`).join(" -> ")}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">How this drives auto-populated recommendations</p>
            <p>
              Effective sets are counted as primary muscle = 1.0 set and secondary muscle = 0.5 set. If weekly workload is high, the app
              trims recommendation volume. If workload is low and performance is stable, it can add one working set.
            </p>
            <p>
              Baseline progression uses double progression with small load jumps, then rounds to practical plate/dumbbell increments.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
