/**
 * Helper functions for date operations with timezone awareness
 * @author @serabi
 * @created 2025-01-13
 */

import { toUserDateString } from '@/utils/date/timezoneUtils';

/**
 * Legacy-compatible wrapper for timezone-safe date extraction
 * Can be used as a drop-in replacement for problematic toISOString().split('T')[0] patterns
 *
 * @param input - Date input (string, Date object, or null/undefined)
 * @param userTimezone - Optional user timezone (defaults to UTC for backwards compatibility)
 * @returns YYYY-MM-DD string or empty string if invalid
 */
export function safeDateString(
  input: string | Date | null | undefined,
  userTimezone: string = 'UTC'
): string {
  const result = toUserDateString(input, userTimezone);
  return result || '';
}
