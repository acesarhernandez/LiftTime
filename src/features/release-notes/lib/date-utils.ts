/**
 * Utility functions for date handling in the changelog notification system
 */

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function parseDateParts(dateString: string): DateParts | null {
  const match = DATE_ONLY_REGEX.exec(dateString);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const candidate = new Date(year, month - 1, day);
  const isValidDate =
    candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day;

  return isValidDate ? { year, month, day } : null;
}

/**
 * Validates if a given string is a valid ISO timestamp
 * @param timestamp String to validate
 * @returns true if valid ISO timestamp
 */
export function isValidISOTimestamp(timestamp: string): boolean {
  if (!timestamp || typeof timestamp !== "string") {
    return false;
  }

  try {
    const date = new Date(timestamp);
    return !isNaN(date.getTime()) && date.toISOString() === timestamp;
  } catch {
    return false;
  }
}

/**
 * Validates if a date string is in YYYY-MM-DD format
 * @param dateString Date string to validate
 * @returns true if valid date format
 */
export function isValidDateString(dateString: string): boolean {
  if (!dateString || typeof dateString !== "string") {
    return false;
  }

  return parseDateParts(dateString) !== null;
}

/**
 * Compares two date strings (YYYY-MM-DD format) with timezone awareness
 * @param date1 First date string
 * @param date2 Second date string
 * @returns negative if date1 < date2, positive if date1 > date2, 0 if equal
 */
export function compareDateStrings(date1: string, date2: string): number {
  const d1 = parseDateParts(date1);
  const d2 = parseDateParts(date2);

  if (!d1 || !d2) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD.");
  }

  const key1 = d1.year * 10000 + d1.month * 100 + d1.day;
  const key2 = d2.year * 10000 + d2.month * 100 + d2.day;

  return key1 - key2;
}

/**
 * Gets the current date as an ISO timestamp
 * @returns Current date as ISO timestamp string
 */
export function getCurrentISOTimestamp(): string {
  return new Date().toISOString();
}
