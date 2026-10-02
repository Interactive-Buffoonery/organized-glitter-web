/**
 * Formats a Date as a UTC date-only string (YYYY-MM-DD) for import/export payloads.
 */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
