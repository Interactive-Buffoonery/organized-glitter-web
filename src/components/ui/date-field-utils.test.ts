import { describe, expect, it } from 'vitest';

import { getDateFieldSelectedDate, normalizeDateFieldInput } from './date-field-utils';

describe('date field date-only helpers', () => {
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
});
