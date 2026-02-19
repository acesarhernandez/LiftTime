"use client";

import { useState, useEffect, useMemo } from "react";
import { useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ExerciseAttributeValueEnum, WeightUnit } from "@prisma/client";

import { useCurrentLocale, useI18n } from "locales/client";
import Trophy from "@public/images/trophy.png";
import useBoolean from "@/shared/hooks/useBoolean";
import { WorkoutSessionSets } from "@/features/workout-session/ui/workout-session-sets";
import { WorkoutSessionHeader } from "@/features/workout-session/ui/workout-session-header";
import { DonationModal } from "@/features/workout-session/ui/donation-modal";
import { SuggestedWorkoutSet } from "@/features/workout-session/types/workout-set";
import { useDonationModal } from "@/features/workout-session/hooks/use-donation-modal";
import { getWorkoutRecommendationAction } from "@/features/workout-session/actions/get-workout-recommendation.action";
import { WorkoutBuilderFooter } from "@/features/workout-builder/ui/workout-stepper-footer";
import { getExercisesByMuscleAction } from "@/features/workout-builder/actions/get-exercises-by-muscle.action";
import { useSession } from "@/features/auth/lib/auth-client";
import { env } from "@/env";
import { Button } from "@/components/ui/button";
import { NutripureAffiliateBanner } from "@/components/ads/nutripure-affiliate-banner";
import { HorizontalTopBanner } from "@/components/ads";

import { StepperStepProps } from "../types";
import { useWorkoutStepper } from "../hooks/use-workout-stepper";
import { useWorkoutSession } from "../../workout-session/model/use-workout-session";
import { WorkoutPreferencesPanel } from "./workout-preferences-panel";
import { StepperHeader } from "./stepper-header";
import { MuscleSelection } from "./muscle-selection";
import { ExercisesSelection } from "./exercises-selection";
import { EquipmentSelection } from "./equipment-selection";
import { AddExerciseModal } from "./add-exercise-modal";

import type { ExerciseWithAttributes, WorkoutBuilderStep } from "../types";

export function WorkoutStepper() {
  const { loadSessionFromLocal } = useWorkoutSession();
  const { data: authSession } = useSession();

  const t = useI18n();
  const router = useRouter();
  const [fromSession, setFromSession] = useQueryState("fromSession");
  const [isQuickStartAllWorkouts, setIsQuickStartAllWorkouts] = useState(false);
  const {
    currentStep,
    selectedEquipment,
    selectedMuscles,
    selectionMode,
    trainingGoal,
    exercisesByMuscle,
    isLoadingExercises,
    exercisesError,
    nextStep,
    prevStep,
    setSelectionMode,
    setTrainingGoal,
    setEquipment,
    addExercise,
    clearSelectedExercises,
    toggleEquipment,
    clearEquipment,
    toggleMuscle,
    canProceedToStep2,
    canProceedToStep3,
    fetchExercises,
    exercisesOrder,
    shuffleExercise,
    pickExercise,
    shufflingExerciseId,
    goToStep,
    deleteExercise,
  } = useWorkoutStepper();
  const locale = useCurrentLocale();
  useEffect(() => {
    loadSessionFromLocal();
  }, []);

  const [flatExercises, setFlatExercises] = useState<{ id: string; muscle: string; exercise: ExerciseWithAttributes }[]>([]);
  const [quickStartCatalogExercisesByMuscle, setQuickStartCatalogExercisesByMuscle] = useState<
    { muscle: string; exercises: ExerciseWithAttributes[] }[]
  >([]);
  const [quickStartCatalogLoading, setQuickStartCatalogLoading] = useState(false);
  const [quickStartCatalogError, setQuickStartCatalogError] = useState<string | null>(null);

  useEffect(() => {
    if (exercisesByMuscle.length > 0) {
      const flat = exercisesByMuscle.flatMap((group) =>
        group.exercises.map((exercise: ExerciseWithAttributes) => ({
          id: exercise.id,
          muscle: group.muscle,
          exercise,
        })),
      );
      setFlatExercises(flat);
      return;
    }

    setFlatExercises([]);
  }, [exercisesByMuscle]);

  useEffect(() => {
    if (currentStep === 3 && !fromSession && !isQuickStartAllWorkouts) {
      fetchExercises();
    }
  }, [currentStep, selectedEquipment, selectedMuscles, selectionMode, fromSession, isQuickStartAllWorkouts]);

  useEffect(() => {
    let isCancelled = false;

    const loadQuickStartCatalog = async () => {
      if (!(currentStep === 3 && isQuickStartAllWorkouts && !fromSession)) {
        if (!isCancelled) {
          setQuickStartCatalogExercisesByMuscle([]);
          setQuickStartCatalogLoading(false);
          setQuickStartCatalogError(null);
        }
        return;
      }

      setQuickStartCatalogLoading(true);
      setQuickStartCatalogError(null);
      try {
        const result = await getExercisesByMuscleAction({});
        if (result?.serverError) {
          throw new Error(result.serverError);
        }

        if (!isCancelled) {
          setQuickStartCatalogExercisesByMuscle((result?.data ?? []) as { muscle: string; exercises: ExerciseWithAttributes[] }[]);
        }
      } catch (error) {
        if (!isCancelled) {
          setQuickStartCatalogError(error instanceof Error ? error.message : "Failed to load all workouts");
        }
      } finally {
        if (!isCancelled) {
          setQuickStartCatalogLoading(false);
        }
      }
    };

    void loadQuickStartCatalog();

    return () => {
      isCancelled = true;
    };
  }, [currentStep, fromSession, isQuickStartAllWorkouts]);

  const { isWorkoutActive, session, startWorkout, quitWorkout } = useWorkoutSession();

  const handleShuffleExercise = async (exerciseId: string, muscle: string) => {
    try {
      const muscleEnum = muscle as ExerciseAttributeValueEnum;
      await shuffleExercise(exerciseId, muscleEnum);
    } catch (error) {
      console.error("Error shuffling exercise:", error);
      alert("Error shuffling exercise. Please try again.");
    }
  };

  const handlePickExercise = async (exerciseId: string) => {
    try {
      await pickExercise(exerciseId);
      console.log("Exercise picked successfully!");
    } catch (error) {
      console.error("Error picking exercise:", error);
      alert("Error picking exercise. Please try again.");
    }
  };

  const handleDeleteExercise = (exerciseId: string) => {
    deleteExercise(exerciseId);
  };

  const handleToggleCatalogExercise = (exercise: ExerciseWithAttributes, muscle: string, isSelected: boolean) => {
    if (isSelected) {
      deleteExercise(exercise.id);
      return;
    }

    addExercise(exercise, muscle as ExerciseAttributeValueEnum);
  };

  const addExerciseModal = useBoolean();

  const handleAddExercise = () => {
    addExerciseModal.setTrue();
  };

  // Fix: Use flatExercises as the source of truth, respecting exercisesOrder when possible
  const orderedExercises = useMemo(() => {
    if (flatExercises.length === 0) return [];

    if (exercisesOrder.length === 0) {
      // No custom order, use flatExercises as-is
      return flatExercises.map((item) => item.exercise);
    }

    // Create a map for quick lookup
    const exerciseMap = new Map(flatExercises.map((item) => [item.id, item.exercise]));

    // Get ordered exercises that exist in flatExercises
    const orderedResults = exercisesOrder.map((id) => exerciseMap.get(id)).filter(Boolean) as ExerciseWithAttributes[];

    // Add any remaining exercises from flatExercises that aren't in exercisesOrder
    const remainingExercises = flatExercises.filter((item) => !exercisesOrder.includes(item.id)).map((item) => item.exercise);

    return [...orderedResults, ...remainingExercises];
  }, [flatExercises, exercisesOrder]);

  const canContinue = currentStep === 1 ? canProceedToStep2 : currentStep === 2 ? canProceedToStep3 : orderedExercises.length > 0;

  const [isStartingWorkout, setIsStartingWorkout] = useState(false);

  const handleStartWorkout = async () => {
    if (orderedExercises.length === 0) {
      console.log("🚀 [WORKOUT-STEPPER] No exercises to start workout with!");
      return;
    }
    setIsStartingWorkout(true);
    try {
      const hasPresetSets = orderedExercises.some((exercise) => {
        return "sets" in exercise && Array.isArray(exercise.sets) && exercise.sets.length > 0;
      });

      let suggestedSetsByExerciseId: Record<string, SuggestedWorkoutSet[]> | undefined;
      let lastPerformanceByExerciseId: Record<
        string,
        { startedAt: string; reps?: number | null; weight?: number | null; weightUnit?: "kg" | "lbs" | null; durationSec?: number | null }
      > | undefined;

      if (!hasPresetSets && authSession?.user?.id) {
        const recommendationResult = await getWorkoutRecommendationAction({
          userId: authSession.user.id,
          exerciseIds: orderedExercises.map((exercise) => exercise.id),
          fallbackMuscles: selectedMuscles,
          goal: trainingGoal,
          preferredUnit: WeightUnit.lbs,
          includeWarmupSets: true,
          analysisWorkoutCount: 3,
          successStreakThreshold: 2,
        });

        if (recommendationResult?.serverError) {
          console.error("Failed to fetch workout recommendations:", recommendationResult.serverError);
        } else if (recommendationResult?.data?.recommendationsByExerciseId) {
          suggestedSetsByExerciseId = recommendationResult.data.recommendationsByExerciseId;
          lastPerformanceByExerciseId = recommendationResult.data.meta?.lastPerformanceByExerciseId;
        }
      }

      startWorkout(
        orderedExercises,
        selectedEquipment,
        selectedMuscles,
        suggestedSetsByExerciseId,
        trainingGoal,
        lastPerformanceByExerciseId
      );
    } finally {
      setIsStartingWorkout(false);
    }
  };

  const [showCongrats, setShowCongrats] = useState(false);
  const { showModal, openModal, closeModal } = useDonationModal();

  const goToProfile = () => {
    router.push("/profile");
  };

  const handleCongrats = () => {
    setShowCongrats(true);
    // Show donation modal after congrats screen appears
    setTimeout(() => {
      openModal();
    }, 400);
  };

  const handleToggleEquipment = (equipment: ExerciseAttributeValueEnum) => {
    setIsQuickStartAllWorkouts(false);
    toggleEquipment(equipment);
    if (fromSession) setFromSession(null);
  };

  const handleClearEquipment = () => {
    setIsQuickStartAllWorkouts(false);
    clearEquipment();
    if (fromSession) setFromSession(null);
  };

  const handleToggleMuscle = (muscle: ExerciseAttributeValueEnum) => {
    toggleMuscle(muscle);
    if (fromSession) setFromSession(null);
  };

  const handleSelectionModeChange = (mode: "equipment_muscles" | "equipment_only" | "individual") => {
    setIsQuickStartAllWorkouts(false);
    setSelectionMode(mode);
    if (fromSession) setFromSession(null);
  };

  const handleTrainingGoalChange = (goal: "STRENGTH" | "HYPERTROPHY" | "ENDURANCE") => {
    setTrainingGoal(goal);
    if (fromSession) setFromSession(null);
  };

  const handleJumpToAllWorkouts = () => {
    setIsQuickStartAllWorkouts(true);
    clearSelectedExercises();
    setEquipment([]);
    setSelectionMode("individual");
    goToStep(3);
    if (fromSession) setFromSession(null);
  };

  const handleStepClick = (stepNumber: number) => {
    if (stepNumber < currentStep) {
      if (stepNumber < 3) {
        setIsQuickStartAllWorkouts(false);
      }
      goToStep(stepNumber as WorkoutBuilderStep);
    }
  };

  if (showCongrats && !isWorkoutActive) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-16 h-full">
          <Image alt="Trophée" className="w-56 h-56" src={Trophy} />
          <h2 className="text-2xl font-bold mb-2 text-center">{t("workout_builder.session.congrats")}</h2>
          <p className="text-lg text-slate-600 mb-6">{t("workout_builder.session.congrats_subtitle")}</p>
          <Button onClick={goToProfile}>{t("commons.go_to_profile")}</Button>
        </div>
        {/* Donation Modal */}
        <DonationModal isOpen={showModal} onClose={closeModal} />
      </>
    );
  }

  if (isWorkoutActive && session) {
    return (
      <div className="w-full max-w-6xl mx-auto">
        {env.NEXT_PUBLIC_TOP_WORKOUT_SESSION_BANNER_AD_SLOT && (
          <HorizontalTopBanner adSlot={env.NEXT_PUBLIC_TOP_WORKOUT_SESSION_BANNER_AD_SLOT} />
        )}
        {!showCongrats && <WorkoutSessionHeader onQuitWorkout={quitWorkout} />}
        <WorkoutSessionSets isWorkoutActive={isWorkoutActive} onCongrats={handleCongrats} showCongrats={showCongrats} />
      </div>
    );
  }

  const STEPPER_STEPS: StepperStepProps[] = [
    {
      stepNumber: 1,
      title: t("workout_builder.steps.equipment.title"),
      description: t("workout_builder.steps.equipment.description"),
      isActive: false,
      isCompleted: false,
    },
    {
      stepNumber: 2,
      title: t("workout_builder.steps.muscles.title"),
      description: t("workout_builder.steps.muscles.description"),
      isActive: false,
      isCompleted: false,
    },
    {
      stepNumber: 3,
      title: t("workout_builder.steps.exercises.title"),
      description: t("workout_builder.steps.exercises.description"),
      isActive: false,
      isCompleted: false,
    },
  ];

  const steps = STEPPER_STEPS.map((step) => ({
    ...step,
    isActive: step.stepNumber === currentStep,
    isCompleted: step.stepNumber < currentStep,
  }));

  const renderStepContent = () => {
    const selectedExerciseIds = new Set(exercisesOrder);

    switch (currentStep) {
      case 1:
        return (
          <EquipmentSelection
            onClearEquipment={handleClearEquipment}
            onJumpToAllWorkouts={handleJumpToAllWorkouts}
            onToggleEquipment={handleToggleEquipment}
            selectedEquipment={selectedEquipment}
          />
        );
      case 2:
        return (
          <div className="space-y-6">
            <WorkoutPreferencesPanel
              onSelectionModeChange={handleSelectionModeChange}
              onTrainingGoalChange={handleTrainingGoalChange}
              selectionMode={selectionMode}
              trainingGoal={trainingGoal}
            />
            {selectionMode === "equipment_muscles" ? (
              <MuscleSelection
                onToggleMuscle={handleToggleMuscle}
                selectedEquipment={selectedEquipment}
                selectedMuscles={selectedMuscles}
              />
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 bg-slate-50 dark:bg-slate-900/60">
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {selectionMode === "equipment_only"
                    ? "Muscle filtering is skipped. Exercises will be suggested from your selected equipment."
                    : "You can add exercises one-by-one in the next step."}
                </p>
              </div>
            )}
          </div>
        );
      case 3:
        return isQuickStartAllWorkouts ? (
          <div className="space-y-6">
            <WorkoutPreferencesPanel
              onSelectionModeChange={handleSelectionModeChange}
              onTrainingGoalChange={handleTrainingGoalChange}
              selectionMode={selectionMode}
              showSelectionMode={false}
              trainingGoal={trainingGoal}
            />
            <ExercisesSelection
              error={quickStartCatalogError}
              exercisesByMuscle={quickStartCatalogExercisesByMuscle}
              isCatalogMode
              isLoading={quickStartCatalogLoading}
              onAdd={handleAddExercise}
              onDelete={handleDeleteExercise}
              onPick={handlePickExercise}
              onShuffle={handleShuffleExercise}
              onToggleCatalogExercise={handleToggleCatalogExercise}
              selectedExerciseIds={selectedExerciseIds}
              selectionMode={selectionMode}
              shufflingExerciseId={shufflingExerciseId}
            />
          </div>
        ) : (
          <ExercisesSelection
            error={exercisesError}
            exercisesByMuscle={exercisesByMuscle}
            isLoading={isLoadingExercises}
            onAdd={handleAddExercise}
            onDelete={handleDeleteExercise}
            onPick={handlePickExercise}
            onShuffle={handleShuffleExercise}
            selectionMode={selectionMode}
            shufflingExerciseId={shufflingExerciseId}
          />
        );
      default:
        return null;
    }
  };

  const renderTopBanner = () => {
    if (currentStep === 1) {
      // if (locale === "fr") {
      //   return <NutripureAffiliateBanner />;
      // }

      if (env.NEXT_PUBLIC_TOP_STEPPER_STEP_1_BANNER_AD_SLOT || env.NEXT_PUBLIC_EZOIC_TOP_STEPPER_STEP_1_PLACEMENT_ID) {
        return (
          <HorizontalTopBanner
            adSlot={env.NEXT_PUBLIC_TOP_STEPPER_STEP_1_BANNER_AD_SLOT}
            ezoicPlacementId={env.NEXT_PUBLIC_EZOIC_TOP_STEPPER_STEP_1_PLACEMENT_ID}
          />
        );
      }
    }

    if (currentStep === 2) {
      if (locale === "fr") {
        return <NutripureAffiliateBanner />;
      }

      if (env.NEXT_PUBLIC_TOP_STEPPER_STEP_2_BANNER_AD_SLOT || env.NEXT_PUBLIC_EZOIC_TOP_STEPPER_STEP_2_PLACEMENT_ID) {
        return (
          <HorizontalTopBanner
            adSlot={env.NEXT_PUBLIC_TOP_STEPPER_STEP_2_BANNER_AD_SLOT}
            ezoicPlacementId={env.NEXT_PUBLIC_EZOIC_TOP_STEPPER_STEP_2_PLACEMENT_ID}
          />
        );
      }
    }

    if (currentStep === 3) {
      if (locale === "fr") {
        return <NutripureAffiliateBanner />;
      }

      if (env.NEXT_PUBLIC_TOP_STEPPER_STEP_3_BANNER_AD_SLOT || env.NEXT_PUBLIC_EZOIC_TOP_STEPPER_STEP_3_PLACEMENT_ID) {
        return (
          <HorizontalTopBanner
            adSlot={env.NEXT_PUBLIC_TOP_STEPPER_STEP_3_BANNER_AD_SLOT}
            ezoicPlacementId={env.NEXT_PUBLIC_EZOIC_TOP_STEPPER_STEP_3_PLACEMENT_ID}
          />
        );
      }
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto h-full">
      {renderTopBanner()}

      <StepperHeader currentStep={currentStep} onStepClick={handleStepClick} steps={steps} />

      <div className="px-2 sm:px-6">{renderStepContent()}</div>

      <WorkoutBuilderFooter
        canContinue={canContinue}
        currentStep={currentStep}
        isStartingWorkout={isStartingWorkout}
        onNext={nextStep}
        onPrevious={prevStep}
        onStartWorkout={handleStartWorkout}
        totalSteps={STEPPER_STEPS.length}
      />

      <AddExerciseModal isOpen={addExerciseModal.value} onClose={addExerciseModal.setFalse} selectedEquipment={selectedEquipment} />
    </div>
  );
}
