"use server";

import { z } from "zod";
import { WeightUnit } from "@prisma/client";

import { STATISTICS_TIMEFRAMES, type StatisticsTimeframe } from "@/shared/constants/statistics";
import { authenticatedActionClient } from "@/shared/api/safe-actions";
import { getMuscleProgressByUser } from "@/features/workout-session/model/workout-session-read-model";

const timeframeToWeeks: Record<StatisticsTimeframe, number> = {
  [STATISTICS_TIMEFRAMES.FOUR_WEEKS]: 4,
  [STATISTICS_TIMEFRAMES.EIGHT_WEEKS]: 8,
  [STATISTICS_TIMEFRAMES.TWELVE_WEEKS]: 12,
  [STATISTICS_TIMEFRAMES.ONE_YEAR]: 52
};

const getMuscleProgressSchema = z.object({
  timeframe: z.enum([
    STATISTICS_TIMEFRAMES.FOUR_WEEKS,
    STATISTICS_TIMEFRAMES.EIGHT_WEEKS,
    STATISTICS_TIMEFRAMES.TWELVE_WEEKS,
    STATISTICS_TIMEFRAMES.ONE_YEAR
  ]).optional(),
  goal: z.enum(["STRENGTH", "HYPERTROPHY", "ENDURANCE"]).optional()
});

export const getMuscleProgressAction = authenticatedActionClient.schema(getMuscleProgressSchema).action(async ({ parsedInput, ctx }) => {
  const timeframe = parsedInput.timeframe ?? STATISTICS_TIMEFRAMES.EIGHT_WEEKS;
  const goal = parsedInput.goal ?? "HYPERTROPHY";

  const muscles = await getMuscleProgressByUser(ctx.user.id, {
    goal,
    weeks: timeframeToWeeks[timeframe],
    targetWeightUnit: WeightUnit.lbs
  });

  return {
    muscles,
    meta: {
      timeframe,
      goal,
      generatedAt: new Date().toISOString()
    }
  };
});
