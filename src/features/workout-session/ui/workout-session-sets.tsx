"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, Play, ArrowRight, Trophy as TrophyIcon, Plus, Hourglass } from "lucide-react";
import confetti from "canvas-confetti";

import { useCurrentLocale, useI18n } from "locales/client";
import TrophyImg from "@public/images/trophy.png";
import { cn } from "@/shared/lib/utils";
import { useWorkoutSession } from "@/features/workout-session/model/use-workout-session";
import { useSyncWorkoutSessions } from "@/features/workout-session/model/use-sync-workout-sessions";
import { ExerciseVideoModal } from "@/features/workout-builder/ui/exercise-video-modal";
import { useSyncFavoriteExercises } from "@/features/workout-builder/hooks/use-sync-favorite-exercises";
import { env } from "@/env";
import { PremiumUpsellAlert } from "@/components/ui/premium-upsell-alert";
import { Button } from "@/components/ui/button";
import { HorizontalBottomBanner } from "@/components/ads";

import { FavoriteExerciseButton } from "../../workout-builder/ui/favorite-exercise-button";
import { WorkoutSessionSet } from "./workout-session-set";

const REST_SECONDS_BY_GOAL: Record<string, number> = {
  STRENGTH: 150,
  HYPERTROPHY: 90,
  ENDURANCE: 60
};

export function WorkoutSessionSets({
  showCongrats,
  onCongrats,
  isWorkoutActive,
}: {
  showCongrats: boolean;
  onCongrats: VoidFunction;
  isWorkoutActive: boolean;
}) {
  const t = useI18n();
  const router = useRouter();
  const locale = useCurrentLocale();
  const { currentExerciseIndex, session, addSet, updateSet, removeSet, finishSet, goToNextExercise, goToExercise, completeWorkout } =
    useWorkoutSession();
  const exerciseDetailsMap = Object.fromEntries(session?.exercises.map((ex) => [ex.id, ex]) || []);
  const [videoModal, setVideoModal] = useState<{ open: boolean; exerciseId?: string }>({ open: false });
  const { syncSessions } = useSyncWorkoutSessions();
  const prevExerciseIndexRef = useRef<number>(currentExerciseIndex);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { syncFavoriteExercises } = useSyncFavoriteExercises();
  const [activeRestTimer, setActiveRestTimer] = useState<{
    endsAt: number;
    durationSec: number;
    goal: string;
  } | null>(null);
  const [restSecondsRemaining, setRestSecondsRemaining] = useState(0);

  // auto-scroll to current exercise when index changes (but not when adding sets)
  useEffect(() => {
    if (session && currentExerciseIndex >= 0 && prevExerciseIndexRef.current !== currentExerciseIndex) {
      const exerciseElement = document.getElementById(`exercise-${currentExerciseIndex}`);
      if (exerciseElement) {
        const scrollContainer = exerciseElement.closest(".overflow-auto");

        if (scrollContainer) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const elementRect = exerciseElement.getBoundingClientRect();
          const offset = 10;

          const scrollTop = scrollContainer.scrollTop + elementRect.top - containerRect.top - offset;

          scrollContainer.scrollTo({
            top: scrollTop,
            behavior: "smooth",
          });
        } else {
          exerciseElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }
      prevExerciseIndexRef.current = currentExerciseIndex;
    }
  }, [currentExerciseIndex, session]);

  useEffect(() => {
    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeRestTimer) {
      setRestSecondsRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const nextRemaining = Math.max(0, Math.ceil((activeRestTimer.endsAt - Date.now()) / 1000));
      setRestSecondsRemaining(nextRemaining);

      if (nextRemaining <= 0) {
        setActiveRestTimer(null);
      }
    };

    updateRemaining();
    const intervalId = setInterval(updateRemaining, 250);
    return () => clearInterval(intervalId);
  }, [activeRestTimer]);

  if (showCongrats) {
    return (
      <div className="flex flex-col items-center justify-center py-16 h-full">
        <Image alt={t("workout_builder.session.complete") + " trophy"} className="w-56 h-56" src={TrophyImg} />
        <h2 className="text-2xl font-bold mb-2">{t("workout_builder.session.complete") + " ! 🎉"}</h2>
        <p className="text-lg text-slate-600 mb-6">{t("workout_builder.session.workout_in_progress")}</p>
        <Button onClick={() => router.push("/profile")}>{t("commons.go_to_profile")}</Button>
      </div>
    );
  }

  if (!session) {
    return <div className="text-center text-slate-500 py-12">{t("workout_builder.session.no_exercise_selected")}</div>;
  }

  const handleExerciseClick = (targetIndex: number) => {
    if (targetIndex !== currentExerciseIndex) {
      goToExercise(targetIndex);
    }
  };

  const renderStepIcon = (idx: number, allSetsCompleted: boolean) => {
    if (allSetsCompleted) {
      return <Check aria-label="Exercice terminé" className="w-4 h-4 text-white" />;
    }
    if (idx === currentExerciseIndex) {
      return (
        <svg aria-label="Exercice en cours" className="w-8 h-8 animate-ping text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="12" />
        </svg>
      );
    }

    return <Hourglass aria-label="Exercice en cours" className="w-4 h-4 text-gray-600 dark:text-slate-900" />;
  };

  const renderStepBackground = (idx: number, allSetsCompleted: boolean) => {
    if (allSetsCompleted) {
      return "bg-green-500 border-green-500";
    }
    if (idx === currentExerciseIndex) {
      return "bg-gray-300 border-gray-400 dark:bg-slate-500 dark:border-slate-500";
    }
    return "bg-slate-200 border-slate-200";
  };

  const handleFinishSession = async () => {
    completeWorkout();
    await Promise.all([syncFavoriteExercises(), syncSessions()]);
    onCongrats();
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  };

  const handleFinishSet = (exerciseIndex: number, setIndex: number) => {
    finishSet(exerciseIndex, setIndex);
    const goal = session?.trainingGoal ?? "HYPERTROPHY";
    const defaultRestDuration = REST_SECONDS_BY_GOAL[goal] ?? REST_SECONDS_BY_GOAL.HYPERTROPHY;
    setActiveRestTimer({
      endsAt: Date.now() + defaultRestDuration * 1000,
      durationSec: defaultRestDuration,
      goal
    });
    void syncSessions();
  };

  const scheduleSync = () => {
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
    }

    syncDebounceRef.current = setTimeout(() => {
      void syncSessions();
    }, 500);
  };

  const formatDuration = (durationSec: number) => {
    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const formatLastPerformance = (exerciseId: string) => {
    const lastPerformance = exerciseDetailsMap[exerciseId]?.lastPerformance;
    if (!lastPerformance) {
      return null;
    }

    if (typeof lastPerformance.weight === "number" && typeof lastPerformance.reps === "number") {
      return `${lastPerformance.reps} reps @ ${lastPerformance.weight} ${lastPerformance.weightUnit ?? "lbs"}`;
    }

    if (typeof lastPerformance.reps === "number") {
      return `${lastPerformance.reps} reps`;
    }

    if (typeof lastPerformance.durationSec === "number") {
      return `${lastPerformance.durationSec}s`;
    }

    return null;
  };

  return (
    <div className="w-full max-w-3xl mx-auto pb-8 px-3 sm:px-6">
      <div className="mb-6">
        <PremiumUpsellAlert />
      </div>
      {activeRestTimer && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wide opacity-80">Auto Rest Timer ({activeRestTimer.goal})</div>
              <div className="text-2xl font-bold mt-1">{formatDuration(restSecondsRemaining)}</div>
              <div className="text-xs opacity-80 mt-1">Default goal rest: {activeRestTimer.durationSec}s</div>
            </div>
            <Button
              className="border-emerald-500/40 text-emerald-800 dark:text-emerald-100"
              onClick={() => setActiveRestTimer(null)}
              size="small"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      <ol className="relative border-l-2 ml-2 border-slate-200 dark:border-slate-700">
        {session.exercises.map((ex, idx) => {
          const allSetsCompleted = ex.sets.length > 0 && ex.sets.every((set) => set.completed);
          const exerciseName = locale === "fr" ? ex.name : ex.nameEn;
          const lastPerformanceLabel = formatLastPerformance(ex.id);

          const details = exerciseDetailsMap[ex.id];
          return (
            <li
              className={`mb-8 ml-4 ${idx !== currentExerciseIndex ? "cursor-pointer hover:opacity-80" : ""}`}
              id={`exercise-${idx}`}
              key={ex.id}
              onClick={() => handleExerciseClick(idx)}
            >
              {/* Cercle étape */}
              <span
                className={cn(
                  "absolute -left-4 flex items-center justify-center w-8 h-8 rounded-full border-4 z-10",
                  renderStepBackground(idx, allSetsCompleted),
                )}
              >
                {renderStepIcon(idx, allSetsCompleted)}
              </span>
              {/* Image + nom de l'exercice */}
              <div className="flex items-center gap-3 ml-2 hover:opacity-80">
                {details?.fullVideoImageUrl && (
                  <div
                    className="relative aspect-video max-w-24 rounded-lg overflow-hidden shrink-0 bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVideoModal({ open: true, exerciseId: ex.id });
                    }}
                  >
                    <Image
                      alt={exerciseName || "Exercise image"}
                      className="w-full h-full object-cover scale-[1.35]"
                      height={48}
                      src={details.fullVideoImageUrl}
                      width={48}
                    />
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200">
                      <Button className="bg-white/80" size="icon" variant="ghost">
                        <Play className="h-4 w-4 text-blue-600" />
                      </Button>
                    </div>
                  </div>
                )}
                <div
                  className={cn(
                    "text-xl leading-[1.3] flex-1",
                    idx === currentExerciseIndex
                      ? "font-bold text-blue-600"
                      : "text-slate-700 dark:text-slate-300 transition-colors hover:text-blue-500",
                  )}
                >
                  <span className="text-xl leading-[1.3] flex-1">{exerciseName}</span>
                  {lastPerformanceLabel && (
                    <span className="flex text-xs mt-1 text-emerald-600 dark:text-emerald-300">
                      Last session: {lastPerformanceLabel}
                    </span>
                  )}
                  {details?.introduction && (
                    <span
                      className="flex text-xs mt-1 text-slate-500 dark:text-slate-400 underline cursor-pointer hover:text-blue-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        setVideoModal({ open: true, exerciseId: ex.id });
                      }}
                    >
                      {t("workout_builder.session.see_instructions")}
                    </span>
                  )}
                </div>
              </div>
              {/* Modale vidéo */}
              {details && details.fullVideoUrl && videoModal.open && videoModal.exerciseId === ex.id && (
                <ExerciseVideoModal
                  exercise={details}
                  onOpenChange={(open) => setVideoModal({ open, exerciseId: open ? ex.id : undefined })}
                  open={videoModal.open}
                />
              )}
              {/* Si exercice courant, afficher le détail */}
              {idx === currentExerciseIndex && (
                <div className="bg-white dark:bg-transparent rounded-xl mt-6 mb-10">
                  {/* Liste des sets */}
                  <div className="flex justify-start items-center gap-2">
                    <FavoriteExerciseButton exerciseId={ex.id} />
                  </div>
                  {ex.sets.some((set) => set.recommendationReason) && (
                    <div className="mt-3 mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100">
                      <span className="font-semibold">Recommendation notes:</span>{" "}
                      {ex.sets.find((set) => set.recommendationReason)?.recommendationReason}
                    </div>
                  )}
                  <div className="space-y-10 mb-8">
                    {ex.sets.map((set, setIdx) => (
                      <WorkoutSessionSet
                        key={set.id}
                        onChange={(sIdx: number, data: Partial<typeof set>) => {
                          updateSet(idx, sIdx, data);
                          scheduleSync();
                        }}
                        onFinish={() => handleFinishSet(idx, setIdx)}
                        onRemove={() => removeSet(idx, setIdx)}
                        set={set}
                        setIndex={setIdx}
                      />
                    ))}
                  </div>
                  {/* Actions bas de page */}
                  <div className="flex flex-col md:flex-row gap-3 w-full mt-2 px-2">
                    <Button
                      aria-label="Ajouter une série"
                      className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl border border-green-600 transition-all duration-200 active:scale-95 focus:ring-2 focus:ring-green-400"
                      onClick={addSet}
                    >
                      <Plus className="h-5 w-5" />
                      {t("workout_builder.session.add_set")}
                    </Button>
                    <Button
                      aria-label="Exercice suivant"
                      className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-xl border border-blue-600 transition-all duration-200 active:scale-95 focus:ring-2 focus:ring-blue-400"
                      onClick={goToNextExercise}
                    >
                      <ArrowRight className="h-5 w-5" />
                      {t("workout_builder.session.next_exercise")}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {isWorkoutActive && (
        <div className="flex justify-center mt-8 mb-24">
          <Button
            aria-label={t("workout_builder.session.finish_session")}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-8 py-3 text-lg rounded-2xl border border-green-700 transition-all duration-200 active:scale-95 focus:ring-2 focus:ring-green-400"
            onClick={handleFinishSession}
          >
            <TrophyIcon className="h-6 w-6" />
            {t("workout_builder.session.finish_session")}
          </Button>
        </div>
      )}

      {env.NEXT_PUBLIC_BOTTOM_WORKOUT_SESSION_BANNER_AD_SLOT && (
        <HorizontalBottomBanner adSlot={env.NEXT_PUBLIC_BOTTOM_WORKOUT_SESSION_BANNER_AD_SLOT} />
      )}
    </div>
  );
}
