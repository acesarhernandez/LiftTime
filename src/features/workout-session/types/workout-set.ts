import { ExerciseWithAttributes } from "@/entities/exercise/types/exercise.types";

export type WorkoutSetType = "TIME" | "WEIGHT" | "REPS" | "BODYWEIGHT" | "NA";
export type WorkoutSetUnit = "kg" | "lbs";
export type WorkoutSetDbType = "NORMAL" | "WARMUP" | "DROP" | "FAILURE" | "AMRAP" | "BACKOFF";

export interface WorkoutSet {
  id: string;
  setIndex: number;
  type?: WorkoutSetDbType;
  types: WorkoutSetType[]; // To support multiple columns
  valuesInt?: number[]; // To support multiple columns
  valuesSec?: number[]; // To support multiple columns
  units?: WorkoutSetUnit[]; // Pour supporter plusieurs colonnes
  recommendationReason?: string;
  completed: boolean;
}

export interface SuggestedWorkoutSet {
  setIndex: number;
  type?: WorkoutSetDbType;
  types: WorkoutSetType[];
  valuesInt?: number[];
  valuesSec?: number[];
  units?: WorkoutSetUnit[];
  recommendationReason?: string;
}

export interface WorkoutSessionExercise extends ExerciseWithAttributes {
  id: string;
  order: number;
  sets: WorkoutSet[];
}
