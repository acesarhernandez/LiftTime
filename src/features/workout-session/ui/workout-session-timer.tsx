"use client";

import { useEffect, useState } from "react";
import { Play, Pause, SkipForward, TimerReset } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { useWorkoutSession } from "@/features/workout-builder";
import { Timer } from "@/components/ui/timer";
import { Button } from "@/components/ui/button";

function formatDuration(durationSec: number): string {
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function WorkoutSessionTimer() {
  const {
    session,
    restTimer,
    elapsedTime,
    isWorkoutActive,
    isTimerRunning,
    toggleTimer,
    resetTimer,
    setElapsedTime,
    getExercisesCompleted,
    getTotalExercises,
    completeRestTimer,
    cancelRestTimer
  } = useWorkoutSession();
  const [restSecondsRemaining, setRestSecondsRemaining] = useState(0);

  useEffect(() => {
    if (!restTimer) {
      setRestSecondsRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const nextRemaining = Math.max(0, Math.ceil((restTimer.endsAt - Date.now()) / 1000));
      setRestSecondsRemaining(nextRemaining);

      if (nextRemaining <= 0 && !restTimer.finishedAt) {
        completeRestTimer();
      }

      if (nextRemaining <= 0 && restTimer.finishedAt && Date.now() - restTimer.finishedAt >= 7000) {
        cancelRestTimer();
      }
    };

    updateRemaining();
    const intervalId = setInterval(updateRemaining, 250);
    return () => clearInterval(intervalId);
  }, [restTimer, completeRestTimer, cancelRestTimer]);

  if (!isWorkoutActive || !session) {
    return null;
  }

  const completedExercises = getExercisesCompleted();
  const totalExercises = getTotalExercises();
  const progressPercent = totalExercises > 0 ? Math.round((completedExercises / totalExercises) * 100) : 0;
  const isRestPhase = Boolean(restTimer);

  return (
    <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 w-[min(94vw,56rem)]">
      <div
        className={cn(
          "bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 shadow-lg backdrop-blur-sm rounded-2xl transition-all duration-300",
          isRestPhase ? "px-4 py-3" : "px-4 py-2"
        )}
      >
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1 overflow-hidden mb-2">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Session progress
            </div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {completedExercises}/{totalExercises} exercises
            </div>
          </div>

          {isRestPhase ? (
            <div className="text-center">
              <div className="text-[11px] uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                Rest ({restTimer?.goal ?? session.trainingGoal ?? "HYPERTROPHY"})
              </div>
              <div className="text-2xl font-mono font-bold text-emerald-700 dark:text-emerald-200">{formatDuration(restSecondsRemaining)}</div>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Session timer</div>
              <div className="text-xl font-mono font-bold text-slate-900 dark:text-white tracking-wider">
                <Timer initialSeconds={elapsedTime} isRunning={isTimerRunning} onChange={setElapsedTime} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {isRestPhase ? (
              <Button className="h-9 px-3" onClick={cancelRestTimer} size="small" variant="outline">
                <SkipForward className="h-4 w-4 mr-1" />
                Skip rest
              </Button>
            ) : (
              <>
                <Button
                  className={cn(
                    "w-10 h-10 rounded-full p-0 text-white shadow-md",
                    isTimerRunning ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-500 hover:bg-emerald-600"
                  )}
                  onClick={toggleTimer}
                >
                  {isTimerRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </Button>
                <Button className="w-10 h-10 rounded-full p-0" onClick={resetTimer} variant="outline">
                  <TimerReset className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
