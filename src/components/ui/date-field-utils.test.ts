import { describe, expect, it } from 'vitest';
import { CalendarDate } from '@internationalized/date';

import {
  formatDateOnlyForDateField,
  getDateFieldFocusedDate,
  getDateFieldSelectedDate,
  normalizeDateFieldInput,
} from './date-field-utils';

describe('date field date-only helpers', () => {
  it('formats selected calendar dates as YYYY-MM-DD strings', () => {
    expect(formatDateOnlyForDateField(new CalendarDate(2026, 5, 15))).toBe('2026-05-15');
  });

  it('parses valid date-only values as calendar dates', () => {
    const selected = getDateFieldSelectedDate('2026-05-09');

    expect(selected?.year).toBe(2026);
    expect(selected?.month).toBe(5);
    expect(selected?.day).toBe(9);
  });

  it('normalizes common US slash dates to date-only values', () => {
    expect(normalizeDateFieldInput('7/3/2024')).toBe('2024-07-03');
    expect(normalizeDateFieldInput('07/03/2024')).toBe('2024-07-03');
  });

  it('preserves impossible slash dates for form validation', () => {
    expect(normalizeDateFieldInput('2/30/2024')).toBe('2/30/2024');
    expect(normalizeDateFieldInput('13/1/2024')).toBe('13/1/2024');
  });

  it('keeps canonical date-only values unchanged', () => {
    expect(normalizeDateFieldInput('2024-07-03')).toBe('2024-07-03');
  });

  it('leaves invalid typed values for form validation instead of coercing them', () => {
    expect(getDateFieldSelectedDate('soon-ish')).toBeNull();
  });

  it('uses the selected date as the focused calendar date when possible', () => {
    const fallback = new CalendarDate(2024, 1, 1);
    const focusedDate = getDateFieldFocusedDate('2026-05-09', fallback);

    expect(focusedDate.year).toBe(2026);
    expect(focusedDate.month).toBe(5);
    expect(focusedDate.day).toBe(9);
  });

  it('uses valid slash dates as the focused calendar date when possible', () => {
    const fallback = new CalendarDate(2026, 5, 17);
    const focusedDate = getDateFieldFocusedDate('7/3/2024', fallback);

    expect(focusedDate.year).toBe(2024);
    expect(focusedDate.month).toBe(7);
    expect(focusedDate.day).toBe(3);
  });

  it('falls back when typed text is not a valid date-only value', () => {
    const fallback = new CalendarDate(2024, 1, 1);

    expect(getDateFieldFocusedDate('soon-ish', fallback)).toBe(fallback);
  });
});
