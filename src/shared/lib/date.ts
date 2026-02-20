import relativeTime from "dayjs/plugin/relativeTime";
import dayjs from "dayjs";
import "dayjs/locale/fr";
import "dayjs/locale/en";


dayjs.extend(relativeTime);

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function toDayjsDate(date: string | Date): dayjs.Dayjs {
  if (typeof date === "string" && DATE_ONLY_REGEX.test(date)) {
    const [year, month, day] = date.split("-").map(Number);
    return dayjs(new Date(year, month - 1, day));
  }

  return dayjs(date);
}

/**
 * Default date formats for different locales
 */
const DEFAULT_FORMATS = {
  en: "MMMM D, YYYY", // January 15, 2024
  fr: "D MMMM YYYY", // 15 janvier 2024,
  es: "D MMMM YYYY", // 15 de enero de 2024,
  "zh-CN": "YYYY年M月D日", // 2024年1月15日,
  ru: "D MMMM YYYY", // 15 января 2024,
  pt: "D MMMM YYYY", // 15 de janeiro de 2024,
} as const;


/**
 * Short date formats for compact display
 */
const SHORT_FORMATS = {
  en: "MMM YYYY", // Jan 2024
  fr: "MMM YYYY", // janv. 2024
  es: "MMM YYYY", // ene 2024
  "zh-CN": "YYYY年M月", // 2024年1月
  ru: "MMM YYYY", // янв 2024
  pt: "MMM YYYY", // jan 2024
} as const;


/**
 * Date utility abstraction that properly handles locales
 * Abstracts dayjs usage according to FSD architecture
 */
export const formatDate = (date: string | Date, locale: string = "en", format?: string): string => {
  const defaultFormat = DEFAULT_FORMATS[locale as keyof typeof DEFAULT_FORMATS] || DEFAULT_FORMATS.en;
  return toDayjsDate(date)
    .locale(locale)
    .format(format || defaultFormat);
};

/**
 * Get current date in specified locale
 */
export const getCurrentDate = (locale: string = "en"): dayjs.Dayjs => {
  return dayjs().locale(locale);
};


/**
 * Format date for compact display (month + year)
 */
export const formatDateShort = (date: string | Date, locale: string = "en"): string => {
  const shortFormat = SHORT_FORMATS[locale as keyof typeof SHORT_FORMATS] || SHORT_FORMATS.en;
  return toDayjsDate(date)
    .locale(locale)
    .format(shortFormat);
};

/**
 * Format relative time (e.g., "2 hours ago", "3 days ago")
 */
export const formatRelativeTime = (
  date: string | Date | null,
  locale: string = "en",
  justNowText: string = "just now"
): string | null => {
  if (!date) return null;

  const target = toDayjsDate(date).locale(locale);
  const now = dayjs().locale(locale);


  // Safety check: if date is in the future, treat as "just now"
  if (target.isAfter(now)) {
    console.warn("date is in the future:", target.format(), "treating as \"just now\"");
    return justNowText;
  }

  // If less than 1 minute ago, show "just now" instead of "in a few seconds"
  if (now.diff(target, "minute") < 1) {
    return justNowText;
  }

  return target.fromNow();
};

/**
 * Parse date and set locale
 */
export const parseDate = (date: string | Date, locale: string = "en"): dayjs.Dayjs => {
  return toDayjsDate(date).locale(locale);
};
