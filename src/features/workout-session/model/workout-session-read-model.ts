import { ExerciseAttributeNameEnum, ExerciseAttributeValueEnum, type Prisma, WeightUnit, WorkoutSetType } from "@prisma/client";

import { convertWeight } from "@/shared/lib/weight-conversion";
import { prisma } from "@/shared/lib/prisma";

interface LastPerformance {
  sessionId: string;
  exerciseId: string;
  startedAt: Date;
  setId: string;
  setIndex: number;
  type: string;
  reps: number | null;
  weight: number | null;
  weightUnit: WeightUnit | null;
  durationSec: number | null;
}

interface WeeklyVolumePoint {
  weekStart: string;
  totalVolume: number;
  setsCount: number;
}

export interface MuscleWeeklyPoint {
  weekStart: string;
  effectiveSets: number;
  totalVolume: number;
}

export interface MuscleExerciseContribution {
  exerciseId: string;
  exerciseName: string;
  effectiveSets: number;
}

export type MuscleFatigueStatus = "LOW" | "TARGET" | "HIGH";
export type RecommendationGoal = "STRENGTH" | "HYPERTROPHY" | "ENDURANCE";

export interface MuscleProgressPoint {
  muscle: ExerciseAttributeValueEnum;
  fatigueStatus: MuscleFatigueStatus;
  currentWeekEffectiveSets: number;
  currentWeekTotalVolume: number;
  targetMinSets: number;
  targetMaxSets: number;
  fatigueRatio: number;
  weekly: MuscleWeeklyPoint[];
  topExercises: MuscleExerciseContribution[];
}

interface GoalMuscleSetTargets {
  minSets: number;
  maxSets: number;
}

interface ExerciseMuscleContribution {
  muscle: ExerciseAttributeValueEnum;
  credit: number;
}

const PRIMARY_MUSCLE_CREDIT = 1;
const SECONDARY_MUSCLE_CREDIT = 0.5;

export const GOAL_MUSCLE_SET_TARGETS: Record<RecommendationGoal, GoalMuscleSetTargets> = {
  STRENGTH: {
    minSets: 6,
    maxSets: 10,
  },
  HYPERTROPHY: {
    minSets: 10,
    maxSets: 20,
  },
  ENDURANCE: {
    minSets: 8,
    maxSets: 14,
  },
};

interface WorkoutSessionReadModelPrismaClient {
  workoutSessionExercise: {
    findFirst: (args: Prisma.WorkoutSessionExerciseFindFirstArgs) => Promise<{
      workoutSessionId: string;
      exerciseId: string;
      workoutSession: { startedAt: Date };
      sets: Array<{
        id: string;
        setIndex: number;
        type: string;
        reps: number | null;
        weight: Prisma.Decimal | null;
        weightUnit: WeightUnit | null;
        durationSec: number | null;
      }>;
    } | null>;
  };
  workoutSet: {
    findMany: (args: Prisma.WorkoutSetFindManyArgs) => Promise<Array<{
      setIndex: number;
      type?: WorkoutSetType;
      reps: number | null;
      weight: Prisma.Decimal | null;
      weightUnit: WeightUnit | null;
      durationSec: number | null;
      workoutSessionExercise: {
        exerciseId?: string;
        workoutSession: {
          startedAt: Date;
        };
        exercise?: {
          id: string;
          name: string;
          nameEn: string | null;
          attributes: Array<{
            attributeName: {
              name: ExerciseAttributeNameEnum;
            };
            attributeValue: {
              value: ExerciseAttributeValueEnum;
            };
          }>;
        };
      };
    }>>;
  };
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function getWeekStartDate(date: Date): Date {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;

  utcDate.setUTCDate(utcDate.getUTCDate() + diff);
  return utcDate;
}

function toWeekKey(date: Date): string {
  return getWeekStartDate(date).toISOString().split("T")[0];
}

function calculateSetVolume(
  reps: number | null,
  weight: Prisma.Decimal | null,
  weightUnit: WeightUnit | null,
  durationSec: number | null,
  targetWeightUnit: WeightUnit,
) {
  const parsedWeight = decimalToNumber(weight);
  if (parsedWeight !== null && reps !== null) {
    const sourceUnit = weightUnit ?? WeightUnit.kg;
    const convertedWeight = convertWeight(parsedWeight, sourceUnit, targetWeightUnit);

    return reps * convertedWeight;
  }

  if (reps !== null) {
    return reps;
  }

  if (durationSec !== null) {
    return durationSec;
  }

  return 0;
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function isTrackableWorkingSet(row: {
  type?: WorkoutSetType;
  reps: number | null;
  weight: Prisma.Decimal | null;
  durationSec: number | null;
}): boolean {
  if (row.type === WorkoutSetType.WARMUP) {
    return false;
  }

  return row.reps !== null || row.weight !== null || row.durationSec !== null;
}

function resolveExerciseMuscleContributions(
  attributes: Array<{
    attributeName: {
      name: ExerciseAttributeNameEnum;
    };
    attributeValue: {
      value: ExerciseAttributeValueEnum;
    };
  }>,
): ExerciseMuscleContribution[] {
  const primaryMuscle = attributes.find((attribute) => attribute.attributeName.name === ExerciseAttributeNameEnum.PRIMARY_MUSCLE)
    ?.attributeValue.value;
  const secondaryMuscles = attributes
    .filter((attribute) => attribute.attributeName.name === ExerciseAttributeNameEnum.SECONDARY_MUSCLE)
    .map((attribute) => attribute.attributeValue.value);

  if (!primaryMuscle && secondaryMuscles.length === 0) {
    return [];
  }

  const contributions: ExerciseMuscleContribution[] = [];
  if (primaryMuscle) {
    contributions.push({
      muscle: primaryMuscle,
      credit: PRIMARY_MUSCLE_CREDIT,
    });
  } else if (secondaryMuscles.length > 0) {
    contributions.push({
      muscle: secondaryMuscles[0],
      credit: PRIMARY_MUSCLE_CREDIT,
    });
  }

  secondaryMuscles
    .filter((secondaryMuscle) => secondaryMuscle !== primaryMuscle)
    .forEach((secondaryMuscle) => {
      contributions.push({
        muscle: secondaryMuscle,
        credit: SECONDARY_MUSCLE_CREDIT,
      });
    });

  return contributions;
}

function getFatigueStatus(effectiveSets: number, target: GoalMuscleSetTargets): MuscleFatigueStatus {
  if (effectiveSets < target.minSets * 0.8) {
    return "LOW";
  }

  if (effectiveSets > target.maxSets * 1.1) {
    return "HIGH";
  }

  return "TARGET";
}

export function aggregateMuscleProgress(
  rows: Array<{
    type?: WorkoutSetType;
    reps: number | null;
    weight: Prisma.Decimal | null;
    weightUnit: WeightUnit | null;
    durationSec: number | null;
    workoutSessionExercise: {
      exerciseId?: string;
      workoutSession: {
        startedAt: Date;
      };
      exercise?: {
        id: string;
        name: string;
        nameEn: string | null;
        attributes: Array<{
          attributeName: {
            name: ExerciseAttributeNameEnum;
          };
          attributeValue: {
            value: ExerciseAttributeValueEnum;
          };
        }>;
      };
    };
  }>,
  goal: RecommendationGoal = "HYPERTROPHY",
  targetWeightUnit: WeightUnit = WeightUnit.lbs,
): MuscleProgressPoint[] {
  const perMuscleWeekly = new Map<ExerciseAttributeValueEnum, Map<string, { effectiveSets: number; totalVolume: number }>>();
  const perMuscleExercises = new Map<
    ExerciseAttributeValueEnum,
    Map<string, { exerciseId: string; exerciseName: string; effectiveSets: number }>
  >();
  const currentWeekKey = toWeekKey(new Date());

  rows.forEach((row) => {
    if (!isTrackableWorkingSet(row)) {
      return;
    }

    const contributions = resolveExerciseMuscleContributions(row.workoutSessionExercise.exercise?.attributes ?? []);
    if (contributions.length === 0) {
      return;
    }

    const weekKey = toWeekKey(row.workoutSessionExercise.workoutSession.startedAt);
    const setVolume = calculateSetVolume(row.reps, row.weight, row.weightUnit, row.durationSec, targetWeightUnit);

    contributions.forEach((contribution) => {
      const muscleWeeks = perMuscleWeekly.get(contribution.muscle) ?? new Map();
      const existingWeek = muscleWeeks.get(weekKey) ?? { effectiveSets: 0, totalVolume: 0 };

      muscleWeeks.set(weekKey, {
        effectiveSets: existingWeek.effectiveSets + contribution.credit,
        totalVolume: existingWeek.totalVolume + setVolume * contribution.credit,
      });

      perMuscleWeekly.set(contribution.muscle, muscleWeeks);

      const exerciseId = row.workoutSessionExercise.exerciseId ?? row.workoutSessionExercise.exercise?.id;
      if (exerciseId) {
        const exerciseName =
          row.workoutSessionExercise.exercise?.nameEn ?? row.workoutSessionExercise.exercise?.name ?? exerciseId;
        const perExercise = perMuscleExercises.get(contribution.muscle) ?? new Map();
        const existingExercise = perExercise.get(exerciseId);

        perExercise.set(exerciseId, {
          exerciseId,
          exerciseName,
          effectiveSets: (existingExercise?.effectiveSets ?? 0) + contribution.credit,
        });

        perMuscleExercises.set(contribution.muscle, perExercise);
      }
    });
  });

  const target = GOAL_MUSCLE_SET_TARGETS[goal];

  return Array.from(perMuscleWeekly.entries())
    .map(([muscle, weeklyMap]) => {
      const weekly = Array.from(weeklyMap.entries())
        .map(([weekStart, values]) => ({
          weekStart,
          effectiveSets: roundToTwoDecimals(values.effectiveSets),
          totalVolume: roundToTwoDecimals(values.totalVolume),
        }))
        .sort((firstPoint, secondPoint) => firstPoint.weekStart.localeCompare(secondPoint.weekStart));

      const currentWeek = weeklyMap.get(currentWeekKey) ?? { effectiveSets: 0, totalVolume: 0 };
      const fatigueRatioBase = (target.minSets + target.maxSets) / 2;
      const fatigueRatio = fatigueRatioBase > 0 ? roundToTwoDecimals(currentWeek.effectiveSets / fatigueRatioBase) : 0;

      const topExercises = Array.from(perMuscleExercises.get(muscle)?.values() ?? [])
        .sort((firstExercise, secondExercise) => secondExercise.effectiveSets - firstExercise.effectiveSets)
        .slice(0, 3)
        .map((exercise) => ({
          ...exercise,
          effectiveSets: roundToTwoDecimals(exercise.effectiveSets),
        }));

      return {
        muscle,
        fatigueStatus: getFatigueStatus(currentWeek.effectiveSets, target),
        currentWeekEffectiveSets: roundToTwoDecimals(currentWeek.effectiveSets),
        currentWeekTotalVolume: roundToTwoDecimals(currentWeek.totalVolume),
        targetMinSets: target.minSets,
        targetMaxSets: target.maxSets,
        fatigueRatio,
        weekly,
        topExercises,
      };
    })
    .sort((firstPoint, secondPoint) => secondPoint.currentWeekEffectiveSets - firstPoint.currentWeekEffectiveSets);
}

export function aggregateWeeklyVolume(
  rows: Array<{
    reps: number | null;
    weight: Prisma.Decimal | null;
    weightUnit: WeightUnit | null;
    durationSec: number | null;
    workoutSessionExercise: {
      workoutSession: {
        startedAt: Date;
      };
    };
  }>,
  targetWeightUnit: WeightUnit = WeightUnit.kg,
): WeeklyVolumePoint[] {
  const weeklyTotals = new Map<string, WeeklyVolumePoint>();

  rows.forEach((row) => {
    const weekKey = toWeekKey(row.workoutSessionExercise.workoutSession.startedAt);
    const setVolume = calculateSetVolume(row.reps, row.weight, row.weightUnit, row.durationSec, targetWeightUnit);

    if (setVolume <= 0) {
      return;
    }

    const existingWeek = weeklyTotals.get(weekKey);
    if (!existingWeek) {
      weeklyTotals.set(weekKey, {
        weekStart: weekKey,
        totalVolume: setVolume,
        setsCount: 1,
      });
      return;
    }

    weeklyTotals.set(weekKey, {
      weekStart: weekKey,
      totalVolume: existingWeek.totalVolume + setVolume,
      setsCount: existingWeek.setsCount + 1,
    });
  });

  return Array.from(weeklyTotals.values())
    .map((point) => ({
      ...point,
      totalVolume: Math.round(point.totalVolume * 100) / 100,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export async function getLastPerformanceByExercise(
  userId: string,
  exerciseId: string,
  prismaClient: WorkoutSessionReadModelPrismaClient = prisma,
): Promise<LastPerformance | null> {
  const workoutSessionExercise = await prismaClient.workoutSessionExercise.findFirst({
    where: {
      exerciseId,
      workoutSession: { userId },
    },
    include: {
      workoutSession: {
        select: {
          startedAt: true,
        },
      },
      sets: {
        where: {
          completed: true,
        },
        orderBy: {
          setIndex: "desc",
        },
      },
    },
    orderBy: {
      workoutSession: {
        startedAt: "desc",
      },
    },
  });

  if (!workoutSessionExercise) {
    return null;
  }

  const lastCompletedSet = workoutSessionExercise.sets.find((set) => {
    return set.reps !== null || set.weight !== null || set.durationSec !== null;
  });

  if (!lastCompletedSet) {
    return null;
  }

  return {
    sessionId: workoutSessionExercise.workoutSessionId,
    exerciseId: workoutSessionExercise.exerciseId,
    startedAt: workoutSessionExercise.workoutSession.startedAt,
    setId: lastCompletedSet.id,
    setIndex: lastCompletedSet.setIndex,
    type: lastCompletedSet.type,
    reps: lastCompletedSet.reps,
    weight: decimalToNumber(lastCompletedSet.weight),
    weightUnit: lastCompletedSet.weightUnit,
    durationSec: lastCompletedSet.durationSec,
  };
}

export async function getWeeklyVolumeByUser(
  userId: string,
  weeks: number = 8,
  targetWeightUnit: WeightUnit = WeightUnit.kg,
  prismaClient: WorkoutSessionReadModelPrismaClient = prisma,
): Promise<WeeklyVolumePoint[]> {
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - weeks * 7);
  startDate.setUTCHours(0, 0, 0, 0);

  const completedSets = await prismaClient.workoutSet.findMany({
    where: {
      completed: true,
      workoutSessionExercise: {
        workoutSession: {
          userId,
          startedAt: {
            gte: startDate,
          },
        },
      },
    },
    select: {
      setIndex: true,
      reps: true,
      weight: true,
      weightUnit: true,
      durationSec: true,
      workoutSessionExercise: {
        select: {
          workoutSession: {
            select: {
              startedAt: true,
            },
          },
        },
      },
    },
  });

  return aggregateWeeklyVolume(completedSets, targetWeightUnit);
}

export async function getMuscleProgressByUser(
  userId: string,
  {
    goal = "HYPERTROPHY",
    weeks = 8,
    targetWeightUnit = WeightUnit.lbs,
  }: {
    goal?: RecommendationGoal;
    weeks?: number;
    targetWeightUnit?: WeightUnit;
  } = {},
  prismaClient: WorkoutSessionReadModelPrismaClient = prisma,
): Promise<MuscleProgressPoint[]> {
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - weeks * 7);
  startDate.setUTCHours(0, 0, 0, 0);

  const completedSets = await prismaClient.workoutSet.findMany({
    where: {
      completed: true,
      workoutSessionExercise: {
        workoutSession: {
          userId,
          startedAt: {
            gte: startDate,
          },
        },
      },
    },
    select: {
      setIndex: true,
      type: true,
      reps: true,
      weight: true,
      weightUnit: true,
      durationSec: true,
      workoutSessionExercise: {
        select: {
          exerciseId: true,
          workoutSession: {
            select: {
              startedAt: true,
            },
          },
          exercise: {
            select: {
              id: true,
              name: true,
              nameEn: true,
              attributes: {
                where: {
                  attributeName: {
                    name: {
                      in: [ExerciseAttributeNameEnum.PRIMARY_MUSCLE, ExerciseAttributeNameEnum.SECONDARY_MUSCLE],
                    },
                  },
                },
                select: {
                  attributeName: {
                    select: {
                      name: true,
                    },
                  },
                  attributeValue: {
                    select: {
                      value: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return aggregateMuscleProgress(completedSets, goal, targetWeightUnit);
}
