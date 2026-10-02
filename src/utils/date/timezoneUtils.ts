/**
 * Timezone-safe date utilities for handling date-only fields
 * @author @serabi
 * @created 2025-07-13
 */

import { createLogger } from '@/utils/logger';

const logger = createLogger('TimezoneUtils');
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_ONLY_WITH_OPTIONAL_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;

const pad = (value: number) => String(value).padStart(2, '0');

const monthLong = new Intl.DateTimeFormat('en-US', { month: 'long' });
const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short' });
const weekdayShort = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const wallClockDateFormatters = new Map<string, Intl.DateTimeFormat>();

function ordinal(day: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const mod = day % 100;
  return `${day}${suffixes[(mod - 20) % 10] || suffixes[mod] || suffixes[0]}`;
}

const PATTERN_FORMATTERS: Record<string, (date: Date) => string> = {
  'yyyy-MM-dd': date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
  'yyyy-MM': date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`,
  'M/d/yyyy': date => `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`,
  'MMM yyyy': date => `${monthShort.format(date)} ${date.getFullYear()}`,
  'MMMM yyyy': date => `${monthLong.format(date)} ${date.getFullYear()}`,
  'MMMM d, yyyy': date => `${monthLong.format(date)} ${date.getDate()}, ${date.getFullYear()}`,
  'EEE, MMM d': date =>
    `${weekdayShort.format(date)}, ${monthShort.format(date)} ${date.getDate()}`,
  PPP: date => `${monthLong.format(date)} ${ordinal(date.getDate())}, ${date.getFullYear()}`,
};

/**
 * Formats a Date using the date's local calendar fields (en-US).
 * Supports the fixed set of patterns this app uses; throws on unknown patterns.
 */
export function formatLocalDate(date: Date, formatString: string): string {
  const formatter = PATTERN_FORMATTERS[formatString];
  if (!formatter) {
    throw new Error(`Unsupported date format: ${formatString}`);
  }
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Invalid time value');
  }
  return formatter(date);
}

/**
 * Parses an ISO-like timestamp, tolerating PocketBase's space separator
 * ("2025-08-03 00:00:00.000Z"), which Safari's Date parser rejects.
 */
export function parseTimestamp(value: string): Date {
  return new Date(value.replace(' ', 'T'));
}

/** Returns a Date whose local calendar fields match `date` viewed in `timeZone`. */
function toWallClockDate(date: Date, timeZone: string): Date {
  let formatter = wallClockDateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    wallClockDateFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return new Date(get('year'), get('month') - 1, get('day'));
}

/**
 * Common timezone options for user selection
 */
export interface TimezoneOption {
  value: string;
  label: string;
  region: string;
}

export const TIMEZONE_REGIONS = {
  UTC: 'UTC',
  America: 'Americas',
  Europe: 'Europe & Africa',
  Asia: 'Asia & Pacific',
} as const;

const COMMON_TIMEZONES: TimezoneOption[] = [
  // UTC
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)', region: 'UTC' },

  // Americas
  { value: 'America/New_York', label: 'Eastern Time (New York)', region: 'America' },
  { value: 'America/Chicago', label: 'Central Time (Chicago)', region: 'America' },
  { value: 'America/Denver', label: 'Mountain Time (Denver)', region: 'America' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles)', region: 'America' },
  { value: 'America/Toronto', label: 'Eastern Time (Toronto)', region: 'America' },
  { value: 'America/Vancouver', label: 'Pacific Time (Vancouver)', region: 'America' },

  // Europe & Africa
  { value: 'Europe/London', label: 'British Time (London)', region: 'Europe' },
  { value: 'Europe/Paris', label: 'Central European Time (Paris)', region: 'Europe' },
  { value: 'Europe/Berlin', label: 'Central European Time (Berlin)', region: 'Europe' },
  { value: 'Europe/Rome', label: 'Central European Time (Rome)', region: 'Europe' },
  { value: 'Europe/Madrid', label: 'Central European Time (Madrid)', region: 'Europe' },

  // Asia & Pacific
  { value: 'Asia/Tokyo', label: 'Japan Time (Tokyo)', region: 'Asia' },
  { value: 'Asia/Shanghai', label: 'China Time (Shanghai)', region: 'Asia' },
  { value: 'Asia/Kolkata', label: 'India Time (Kolkata)', region: 'Asia' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (Sydney)', region: 'Asia' },
  { value: 'Australia/Melbourne', label: 'Australian Eastern Time (Melbourne)', region: 'Asia' },
];

/**
 * Groups timezones by region for organized display
 */
export function getTimezonesByRegion(): Record<string, TimezoneOption[]> {
  return COMMON_TIMEZONES.reduce(
    (acc, tz) => {
      if (!acc[tz.region]) acc[tz.region] = [];
      acc[tz.region].push(tz);
      return acc;
    },
    {} as Record<string, TimezoneOption[]>
  );
}

/**
 * Detects the user's browser timezone using Intl API
 */
export function detectUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    logger.warn('Failed to detect user timezone, falling back to UTC', { error });
    return 'UTC';
  }
}

/**
 * Safely converts any date input to YYYY-MM-DD string in the specified timezone
 * This prevents timezone shifts that occur with naive date conversion
 *
 * @param input - Date string, Date object, or null/undefined
 * @param userTimezone - User's preferred timezone (defaults to UTC)
 * @returns YYYY-MM-DD string or null if input is invalid
 */
export function toUserDateString(
  input: string | Date | null | undefined,
  userTimezone: string = 'UTC'
): string | null {
  if (!input) return null;

  try {
    let date: Date;

    if (typeof input === 'string') {
      // YYYY-MM-DD already names a calendar day; midnight in the user's
      // timezone rendered back in that timezone is the same day, so return
      // it unchanged (after validating it is a real date).
      if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        if (!parseDateOnlyAsLocalDate(input)) {
          logger.warn('Invalid date input', { input, userTimezone });
          return null;
        }
        return input;
      }
      date = parseTimestamp(input);
    } else {
      date = input;
    }

    if (isNaN(date.getTime())) {
      logger.warn('Invalid date input', { input, userTimezone });
      return null;
    }

    // Convert to user's timezone and format as YYYY-MM-DD
    return formatLocalDate(toWallClockDate(date, userTimezone), 'yyyy-MM-dd');
  } catch (error) {
    logger.error('Error converting date to user timezone', { input, userTimezone, error });
    return null;
  }
}

/**
 * Parses a date-only value as a local calendar date instead of a UTC instant.
 *
 * HTML date inputs and PocketBase date-only fields use YYYY-MM-DD to represent
 * calendar days. Passing those strings into new Date() treats them as UTC and
 * can display the previous day in US timezones.
 */
export function parseDateOnlyAsLocalDate(value: string): Date | null {
  const match = value.match(DATE_ONLY_PATTERN);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

export function formatDateOnlyForDisplay(
  value: string | null | undefined,
  formatString: string = 'M/d/yyyy'
): string {
  if (!value) return '';

  const localDate = parseDateOnlyAsLocalDate(value);
  if (!localDate) return '';

  return formatLocalDate(localDate, formatString);
}

export function normalizeDateOnlyValue(value: string | null | undefined): string {
  if (!value) return '';

  const trimmed = value.trim();
  const match = trimmed.match(DATE_ONLY_WITH_OPTIONAL_TIME_PATTERN);
  if (!match) return trimmed;

  const dateOnly = `${match[1]}-${match[2]}-${match[3]}`;
  return parseDateOnlyAsLocalDate(dateOnly) ? dateOnly : trimmed;
}

/**
 * Formats a date for display in the user's timezone
 *
 * @param date - Date to format
 * @param userTimezone - User's preferred timezone
 * @param formatString - Date format pattern (defaults to 'PPP' for readable format)
 * @returns Formatted date string
 */
export function formatDateInUserTimezone(
  date: Date | string | null | undefined,
  userTimezone: string,
  formatString: string = 'PPP'
): string {
  if (!date) return '';

  try {
    if (typeof date === 'string') {
      const formattedDateOnly = formatDateOnlyForDisplay(date, formatString);
      if (formattedDateOnly) return formattedDateOnly;
    }

    const parsed = typeof date === 'string' ? parseTimestamp(date) : date;
    return formatLocalDate(toWallClockDate(parsed, userTimezone), formatString);
  } catch (error) {
    logger.error('Error formatting date in timezone', { date, userTimezone, formatString, error });
    return '';
  }
}

/**
 * Gets the current date as YYYY-MM-DD string in user's timezone
 * Useful for setting default values in date inputs
 *
 * @param userTimezone - User's preferred timezone (defaults to UTC)
 * @returns Current date in YYYY-MM-DD format
 */
export function getCurrentDateInUserTimezone(userTimezone: string = 'UTC'): string {
  return toUserDateString(new Date(), userTimezone) ?? '';
}

/**
 * Validates if a timezone string is supported
 *
 * @param timezone - Timezone string to validate
 * @returns True if timezone is valid
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
