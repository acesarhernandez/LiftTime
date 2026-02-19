"use client";

import { useWorkoutBuilderStore } from "../model/workout-builder.store";

export function useWorkoutStepper() {
  const {
    currentStep,
    selectedEquipment,
    selectedMuscles,
    selectionMode,
    trainingGoal,
    exercisesByMuscle,
    isLoadingExercises,
    exercisesError,
    exercisesOrder,
    shufflingExerciseId,
    setStep,
    nextStep,
    prevStep,
    setSelectionMode,
    setTrainingGoal,
    setEquipment,
    toggleEquipment,
    clearEquipment,
    toggleMuscle,
    clearMuscles,
    fetchExercises,
    setExercisesOrder,
    addExercise,
    clearSelectedExercises,
    shuffleExercise,
    pickExercise,
    deleteExercise,
    loadFromSession,
  } = useWorkoutBuilderStore();

  const canProceedToStep2 = selectedEquipment.length > 0;
  const canProceedToStep3 = selectionMode === "equipment_muscles" ? selectedMuscles.length > 0 : true;

  return {
    // state
    currentStep,
    selectedEquipment,
    selectedMuscles,
    selectionMode,
    trainingGoal,

    // exercises
    exercisesByMuscle,
    isLoadingExercises,
    exercisesError,

    // navigation
    goToStep: setStep,
    nextStep,
    prevStep,
    setSelectionMode,
    setTrainingGoal,
    setEquipment,

    // equipment
    toggleEquipment,
    clearEquipment,

    // muscles
    toggleMuscle,
    clearMuscles,

    // validation
    canProceedToStep2,
    canProceedToStep3,

    // fetch
    fetchExercises,

    // order
    exercisesOrder,
    setExercisesOrder,
    addExercise,
    clearSelectedExercises,

    // shuffle
    shuffleExercise,

    // additional
    shufflingExerciseId,

    // pick
    pickExercise,

    // delete
    deleteExercise,

    // load
    loadFromSession,
  };
}
