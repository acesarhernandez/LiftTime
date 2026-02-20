"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, Play, ArrowRight, Trophy as TrophyIcon, Plus, Hourglass, ChevronDown, ChevronUp } from "lucide-react";
import confetti from "canvas-confetti";
import { ExerciseAttributeValueEnum } from "@prisma/client";

import { useCurrentLocale, useI18n } from "locales/client";
import TrophyImg from "@public/images/trophy.png";
import { cn } from "@/shared/lib/utils";
import { BeginnerEffortGrade, supportsPerSetRir } from "@/features/workout-session/types/training-mode";
import { useWorkoutSession } from "@/features/workout-session/model/use-workout-session";
import { useSyncWorkoutSessions } from "@/features/workout-session/model/use-sync-workout-sessions";
import { getCompletedSetCount, getWorkoutExerciseVisualStatus, getWorkoutSetVisualStatus } from "@/features/workout-session/lib/session-status";
import { ExerciseVideoModal } from "@/features/workout-builder/ui/exercise-video-modal";
import { useSyncFavoriteExercises } from "@/features/workout-builder/hooks/use-sync-favorite-exercises";
import { env } from "@/env";
import { PremiumUpsellAlert } from "@/components/ui/premium-upsell-alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HorizontalBottomBanner } from "@/components/ads";

import { FavoriteExerciseButton } from "../../workout-builder/ui/favorite-exercise-button";
import { WorkoutSessionSet } from "./workout-session-set";

const REST_SECONDS_BY_GOAL: Record<string, number> = {
  STRENGTH: 150,
  HYPERTROPHY: 90,
  ENDURANCE: 60
};

const EXERCISE_STATUS_META = {
  PENDING: {
    label: "Pending",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
  },
  IN_PROGRESS: {
    label: "In progress",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
  }
} as const;

const BEGINNER_EFFORT_OPTIONS: Array<{ value: BeginnerEffortGrade; label: string }> = [
  { value: "EASY", label: "Easy" },
  { value: "MODERATE", label: "Moderate" },
  { value: "HARD", label: "Hard" },
  { value: "MAX", label: "Max effort" }
];

const BARBELL_EQUIPMENT_VALUES = new Set<ExerciseAttributeValueEnum>([
  ExerciseAttributeValueEnum.BARBELL,
  ExerciseAttributeValueEnum.EZ_BAR,
  ExerciseAttributeValueEnum.SMITH_MACHINE,
  ExerciseAttributeValueEnum.BAR
]);

function getAttributeValue(attribute: { attributeValue: unknown }): ExerciseAttributeValueEnum | null {
  if (typeof attribute.attributeValue === "string") {
    return attribute.attributeValue as ExerciseAttributeValueEnum;
  }

  if (attribute.attributeValue && typeof attribute.attributeValue === "object" && "value" in attribute.attributeValue) {
    return (attribute.attributeValue as { value: ExerciseAttributeValueEnum }).value;
  }

  return null;
}

function isBarbellExercise(details: { attributes?: Array<{ attributeValue: unknown }> } | undefined): boolean {
  if (!details?.attributes?.length) {
    return false;
  }

  return details.attributes.some((attribute) => {
    const value = getAttributeValue(attribute);
    if (!value) {
      return false;
    }

    return BARBELL_EQUIPMENT_VALUES.has(value);
  });
}

export function WorkoutSessionSets({
  showCongrats,
  onCongrats,
  isWorkoutActive
}: {
  showCongrats: boolean;
  onCongrats: VoidFunction;
  isWorkoutActive: boolean;
}) {
  const t = useI18n();
  const router = useRouter();
  const locale = useCurrentLocale();
  const {
    currentExerciseIndex,
    session,
    restTimer,
    addSet,
    updateSet,
    removeSet,
    finishSet,
    goToNextExercise,
    goToExercise,
    completeWorkout,
    startRestTimer,
    cancelRestTimer,
    completeRestTimer,
    applyBeginnerEffortGrades
  } = useWorkoutSession();
  const exerciseDetailsMap = Object.fromEntries(session?.exercises.map((ex) => [ex.id, ex]) || []);
  const [videoModal, setVideoModal] = useState<{ open: boolean; exerciseId?: string }>({ open: false });
  const [restSecondsRemaining, setRestSecondsRemaining] = useState(0);
  const [expandedExerciseById, setExpandedExerciseById] = useState<Record<string, boolean>>({});
  const [showEffortDialog, setShowEffortDialog] = useState(false);
  const [effortByExerciseId, setEffortByExerciseId] = useState<Partial<Record<string, BeginnerEffortGrade>>>({});
  const { syncSessions } = useSyncWorkoutSessions();
  const { syncFavoriteExercises } = useSyncFavoriteExercises();
  const prevExerciseIndexRef = useRef<number>(currentExerciseIndex);
  const prevCompletedByExerciseIdRef = useRef<Record<string, boolean>>({});
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!session || currentExerciseIndex < 0) {
      return;
    }

    const currentExerciseId = session.exercises[currentExerciseIndex]?.id;
    if (!currentExerciseId) {
      return;
    }

    setExpandedExerciseById((prevState) => ({
      ...prevState,
      [currentExerciseId]: true
    }));
  }, [session, currentExerciseIndex]);

  useEffect(() => {
    if (!session) {
      prevCompletedByExerciseIdRef.current = {};
      return;
    }

    const completedByExerciseId: Record<string, boolean> = {};
    session.exercises.forEach((exercise, index) => {
      const exerciseStatus = getWorkoutExerciseVisualStatus(exercise);
      const isCompleted = exerciseStatus === "COMPLETED";
      completedByExerciseId[exercise.id] = isCompleted;

      const wasCompleted = prevCompletedByExerciseIdRef.current[exercise.id] ?? false;
      if (!wasCompleted && isCompleted) {
        setExpandedExerciseById((prevState) => ({
          ...prevState,
          [exercise.id]: false
        }));

        if (index === currentExerciseIndex) {
          const nextIndex = session.exercises.findIndex((candidate, candidateIndex) => {
            if (candidateIndex <= index) {
              return false;
            }

            return getWorkoutExerciseVisualStatus(candidate) !== "COMPLETED";
          });

          if (nextIndex !== -1) {
            goToExercise(nextIndex);
            const nextExerciseId = session.exercises[nextIndex]?.id;
            if (nextExerciseId) {
              setExpandedExerciseById((prevState) => ({
                ...prevState,
                [nextExerciseId]: true
              }));
            }
          }
        }
      }
    });

    prevCompletedByExerciseIdRef.current = completedByExerciseId;
  }, [session, currentExerciseIndex, goToExercise]);

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
            behavior: "smooth"
          });
        } else {
          exerciseElement.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
        }
      }
      prevExerciseIndexRef.current = currentExerciseIndex;
    }
  }, [currentExerciseIndex, session]);

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
    const targetExercise = session.exercises[targetIndex];
    if (!targetExercise) {
      return;
    }

    if (targetIndex !== currentExerciseIndex) {
      goToExercise(targetIndex);
    }

    setExpandedExerciseById((prevState) => ({
      ...prevState,
      [targetExercise.id]: true
    }));
  };

  const toggleExerciseExpanded = (exerciseId: string, exerciseIndex: number) => {
    const nextIsExpanded = !(expandedExerciseById[exerciseId] ?? false);
    if (nextIsExpanded && exerciseIndex !== currentExerciseIndex) {
      goToExercise(exerciseIndex);
    }

    setExpandedExerciseById((prevState) => ({
      ...prevState,
      [exerciseId]: nextIsExpanded
    }));
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

  const scheduleSync = () => {
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
    }

    syncDebounceRef.current = setTimeout(() => {
      void syncSessions();
    }, 500);
  };

  const handleFinishSet = (exerciseIndex: number, setIndex: number) => {
    finishSet(exerciseIndex, setIndex);

    const goal = session.trainingGoal ?? "HYPERTROPHY";
    const defaultRestDuration = REST_SECONDS_BY_GOAL[goal] ?? REST_SECONDS_BY_GOAL.HYPERTROPHY;
    startRestTimer(defaultRestDuration, goal);
    void syncSessions();
  };

  const completeAndCelebrate = async () => {
    completeWorkout();
    await Promise.all([syncFavoriteExercises(), syncSessions()]);
    onCongrats();
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  };

  const handleFinishSession = async () => {
    if (session.trainingMode === "BEGINNER") {
      setShowEffortDialog(true);
      return;
    }

    await completeAndCelebrate();
  };

  const handleApplyEffortAndFinish = async () => {
    applyBeginnerEffortGrades(effortByExerciseId);
    setShowEffortDialog(false);
    await completeAndCelebrate();
  };

  return (
    <div className="w-full max-w-3xl mx-auto pb-8 px-3 sm:px-6">
      <div className="mb-6">
        <PremiumUpsellAlert />
      </div>

      {restTimer && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wide opacity-80">Auto Rest Timer ({restTimer.goal})</div>
              <div className="text-2xl font-bold mt-1">{formatDuration(restSecondsRemaining)}</div>
              <div className="text-xs opacity-80 mt-1">
                {restTimer.finishedAt ? "Rest complete" : `Default goal rest: ${restTimer.durationSec}s`}
              </div>
            </div>
            <Button className="border-emerald-500/40 text-emerald-800 dark:text-emerald-100" onClick={cancelRestTimer} size="small" variant="outline">
              Cancel
            </Button>
          </div>
        </div>
      )}

      <ol className="relative border-l-2 ml-2 border-slate-200 dark:border-slate-700">
        {session.exercises.map((exercise, idx) => {
          const exerciseStatus = getWorkoutExerciseVisualStatus(exercise);
          const completedSetCount = getCompletedSetCount(exercise);
          const allSetsCompleted = exerciseStatus === "COMPLETED";
          const exerciseName = locale === "fr" ? exercise.name : exercise.nameEn;
          const lastPerformanceLabel = formatLastPerformance(exercise.id);
          const details = exerciseDetailsMap[exercise.id];
          const isExpanded = expandedExerciseById[exercise.id] ?? idx === currentExerciseIndex;
          const statusMeta = EXERCISE_STATUS_META[exerciseStatus];
          const showRirInput = supportsPerSetRir(session.trainingMode);

          return (
            <li
              className={`mb-8 ml-4 ${idx !== currentExerciseIndex ? "cursor-pointer hover:opacity-80" : ""}`}
              id={`exercise-${idx}`}
              key={exercise.id}
              onClick={() => handleExerciseClick(idx)}
            >
              <span
                className={cn(
                  "absolute -left-4 flex items-center justify-center w-8 h-8 rounded-full border-4 z-10",
                  renderStepBackground(idx, allSetsCompleted)
                )}
              >
                {renderStepIcon(idx, allSetsCompleted)}
              </span>

              <div className="flex items-center gap-3 ml-2 hover:opacity-80">
                {details?.fullVideoImageUrl && (
                  <div
                    className="relative aspect-video max-w-24 rounded-lg overflow-hidden shrink-0 bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 cursor-pointer"
                    onClick={(event) => {
                      event.stopPropagation();
                      setVideoModal({ open: true, exerciseId: exercise.id });
                    }}
                  >
                    <Image alt={exerciseName || "Exercise image"} className="w-full h-full object-cover scale-[1.35]" height={48} src={details.fullVideoImageUrl} width={48} />
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
                      : "text-slate-700 dark:text-slate-300 transition-colors hover:text-blue-500"
                  )}
                >
                  <span className="text-xl leading-[1.3] flex-1">{exerciseName}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusMeta.className}`}>{statusMeta.label}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Sets {completedSetCount}/{exercise.sets.length}</span>
                  </div>
                  {lastPerformanceLabel && <span className="flex text-xs mt-1 text-emerald-600 dark:text-emerald-300">Last session: {lastPerformanceLabel}</span>}
                  {details?.introduction && (
                    <span
                      className="flex text-xs mt-1 text-slate-500 dark:text-slate-400 underline cursor-pointer hover:text-blue-600"
                      onClick={(event) => {
                        event.stopPropagation();
                        setVideoModal({ open: true, exerciseId: exercise.id });
                      }}
                    >
                      {t("workout_builder.session.see_instructions")}
                    </span>
                  )}
                </div>
                <Button
                  className="h-8 w-8 shrink-0"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleExerciseExpanded(exercise.id, idx);
                  }}
                  size="icon"
                  variant="ghost"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>

              {details && details.fullVideoUrl && videoModal.open && videoModal.exerciseId === exercise.id && (
                <ExerciseVideoModal
                  exercise={details}
                  onOpenChange={(open) => setVideoModal({ open, exerciseId: open ? exercise.id : undefined })}
                  open={videoModal.open}
                />
              )}

              {isExpanded && idx === currentExerciseIndex && (
                <div className="bg-white dark:bg-transparent rounded-xl mt-6 mb-10">
                  <div className="flex justify-start items-center gap-2">
                    <FavoriteExerciseButton exerciseId={exercise.id} />
                  </div>

                  {exercise.sets.some((set) => set.recommendationReason) && (
                    <div className="mt-3 mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100">
                      <span className="font-semibold">Recommendation notes:</span>{" "}
                      {exercise.sets.find((set) => set.recommendationReason)?.recommendationReason}
                    </div>
                  )}

                  <div className="space-y-10 mb-8">
                    {exercise.sets.map((set, setIdx) => (
                      <WorkoutSessionSet
                        isBarbellExercise={isBarbellExercise(details)}
                        key={set.id}
                        onChange={(sIdx: number, data: Partial<typeof set>) => {
                          updateSet(idx, sIdx, data);
                          scheduleSync();
                        }}
                        onFinish={() => handleFinishSet(idx, setIdx)}
                        onRemove={() => removeSet(idx, setIdx)}
                        set={set}
                        setIndex={setIdx}
                        showRirInput={showRirInput && (set.type ?? "NORMAL") !== "WARMUP"}
                        visualStatus={getWorkoutSetVisualStatus(set)}
                      />
                    ))}
                  </div>

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
            onClick={() => void handleFinishSession()}
          >
            <TrophyIcon className="h-6 w-6" />
            {t("workout_builder.session.finish_session")}
          </Button>
        </div>
      )}

      <Dialog onOpenChange={setShowEffortDialog} open={showEffortDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Optional effort grading</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Beginner mode can apply one effort grade per exercise after your workout. Skip any field to keep progression unaffected.
          </p>
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {session.exercises.map((exercise) => (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center" key={exercise.id}>
                <div className="text-sm font-semibold">{locale === "fr" ? exercise.name : exercise.nameEn}</div>
                <select
                  className="border border-slate-300 dark:border-slate-700 rounded px-2 py-2 text-sm bg-white dark:bg-slate-900"
                  onChange={(event) => {
                    const value = event.target.value as BeginnerEffortGrade | "";
                    setEffortByExerciseId((prevState) => {
                      const nextState = { ...prevState };
                      if (!value) {
                        delete nextState[exercise.id];
                        return nextState;
                      }

                      nextState[exercise.id] = value;
                      return nextState;
                    });
                  }}
                  value={effortByExerciseId[exercise.id] ?? ""}
                >
                  <option value="">Skip</option>
                  {BEGINNER_EFFORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              onClick={() => {
                setShowEffortDialog(false);
                void completeAndCelebrate();
              }}
              variant="outline"
            >
              Skip and finish
            </Button>
            <Button onClick={() => void handleApplyEffortAndFinish()}>Apply and finish</Button>
          </div>
        </DialogContent>
      </Dialog>

      {env.NEXT_PUBLIC_BOTTOM_WORKOUT_SESSION_BANNER_AD_SLOT && (
        <HorizontalBottomBanner adSlot={env.NEXT_PUBLIC_BOTTOM_WORKOUT_SESSION_BANNER_AD_SLOT} />
      )}
    </div>
  );
}
