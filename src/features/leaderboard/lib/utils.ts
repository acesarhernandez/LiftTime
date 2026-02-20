import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import dayjs from "dayjs";

import { APP_LEADERBOARD_TIMEZONE } from "@/shared/config/timezone";

// Initialize dayjs plugins
dayjs.extend(utc);
dayjs.extend(timezone);

export type LeaderboardPeriod = "all-time" | "weekly" | "monthly";

export function getDateRangeForPeriod(period: LeaderboardPeriod): { startDate: Date | undefined; endDate: Date } {
  const now = dayjs().tz(APP_LEADERBOARD_TIMEZONE);

  switch (period) {
    case "weekly": {
      // Start of current week (Monday) in leaderboard timezone
      const startOfWeek = now.startOf("week").add(1, "day"); // dayjs week starts on Sunday, add 1 for Monday
      return {
        startDate: startOfWeek.toDate(),
        endDate: now.toDate(),
      };
    }
    case "monthly": {
      // Start of current month in leaderboard timezone
      const startOfMonth = now.startOf("month");
      return {
        startDate: startOfMonth.toDate(),
        endDate: now.toDate(),
      };
    }
    case "all-time":
    default:
      return {
        startDate: undefined,
        endDate: now.toDate(),
      };
  }
}
