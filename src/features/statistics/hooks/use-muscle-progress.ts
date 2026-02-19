"use client";

import { useQuery } from "@tanstack/react-query";

import { StatisticsTimeframe } from "@/shared/constants/statistics";
import { getMuscleProgressAction } from "@/features/statistics/actions/get-muscle-progress.action";

export function useMuscleProgress(
  timeframe: StatisticsTimeframe,
  goal: "STRENGTH" | "HYPERTROPHY" | "ENDURANCE" = "HYPERTROPHY",
  enabled: boolean = true,
) {
  return useQuery({
    queryKey: ["muscle-progress", timeframe, goal],
    queryFn: async () => {
      const result = await getMuscleProgressAction({ timeframe, goal });

      if (result?.serverError) {
        throw new Error(result.serverError);
      }

      if (!result?.data) {
        throw new Error("No muscle progress data returned");
      }

      return result.data;
    },
    enabled,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000
  });
}
