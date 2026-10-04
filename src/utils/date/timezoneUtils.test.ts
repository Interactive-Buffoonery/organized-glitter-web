import { describe, expect, it, vi } from 'vitest';
import {
  formatDateInUserTimezone,
  formatDateOnlyForDisplay,
  formatLocalDate,
  getCurrentDateInUserTimezone,
  isFutureDateOnly,
  normalizeDateOnlyValue,
  parseTimestamp,
} from './timezoneUtils';

describe('date-only formatting', () => {
  it('keeps YYYY-MM-DD values on the intended calendar day for US timezones', () => {
    const utcParsed = new Date('2026-05-08');

    expect(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
      }).format(utcParsed)
    ).toBe('5/7/2026');
    expect(formatDateOnlyForDisplay('2026-05-08', 'M/d/yyyy')).toBe('5/8/2026');
  });

  it('treats date-only strings as calendar dates in timezone display helpers', () => {
    expect(formatDateInUserTimezone('2026-05-08', 'America/New_York', 'M/d/yyyy')).toBe('5/8/2026');
  });

  it('rejects invalid date-only calendar values', () => {
    expect(formatDateOnlyForDisplay('2026-02-31', 'M/d/yyyy')).toBe('');
  });

  it('normalizes PocketBase date fields to calendar dates', () => {
    expect(normalizeDateOnlyValue('2025-08-03 00:00:00.000Z')).toBe('2025-08-03');
    expect(normalizeDateOnlyValue('2025-08-03T00:00:00.000Z')).toBe('2025-08-03');
  });

  it('preserves non-date and invalid date-only values for callers to handle', () => {
    expect(normalizeDateOnlyValue('not-a-date')).toBe('not-a-date');
    expect(normalizeDateOnlyValue('2026-02-31 00:00:00.000Z')).toBe('2026-02-31 00:00:00.000Z');
  });
});

describe('formatLocalDate', () => {
  const date = new Date(2026, 4, 8);

  it('formats every supported pattern', () => {
    expect(formatLocalDate(date, 'yyyy-MM-dd')).toBe('2026-05-08');
    expect(formatLocalDate(date, 'yyyy-MM')).toBe('2026-05');
    expect(formatLocalDate(date, 'M/d/yyyy')).toBe('5/8/2026');
    expect(formatLocalDate(date, 'MMM yyyy')).toBe('May 2026');
    expect(formatLocalDate(date, 'MMMM yyyy')).toBe('May 2026');
    expect(formatLocalDate(date, 'MMMM d, yyyy')).toBe('May 8, 2026');
    expect(formatLocalDate(date, 'EEE, MMM d')).toBe('Fri, May 8');
    expect(formatLocalDate(date, 'PPP')).toBe('May 8th, 2026');
  });

  it('uses correct ordinal suffixes for PPP', () => {
    expect(formatLocalDate(new Date(2026, 0, 1), 'PPP')).toBe('January 1st, 2026');
    expect(formatLocalDate(new Date(2026, 0, 2), 'PPP')).toBe('January 2nd, 2026');
    expect(formatLocalDate(new Date(2026, 0, 3), 'PPP')).toBe('January 3rd, 2026');
    expect(formatLocalDate(new Date(2026, 0, 11), 'PPP')).toBe('January 11th, 2026');
    expect(formatLocalDate(new Date(2026, 0, 12), 'PPP')).toBe('January 12th, 2026');
    expect(formatLocalDate(new Date(2026, 0, 13), 'PPP')).toBe('January 13th, 2026');
    expect(formatLocalDate(new Date(2026, 0, 21), 'PPP')).toBe('January 21st, 2026');
    expect(formatLocalDate(new Date(2026, 0, 22), 'PPP')).toBe('January 22nd, 2026');
    expect(formatLocalDate(new Date(2026, 0, 23), 'PPP')).toBe('January 23rd, 2026');
    expect(formatLocalDate(new Date(2026, 0, 31), 'PPP')).toBe('January 31st, 2026');
  });

  it('throws on invalid dates', () => {
    expect(() => formatLocalDate(new Date('nonsense'), 'yyyy-MM-dd')).toThrow(RangeError);
  });

  it('throws on unsupported patterns', () => {
    expect(() => formatLocalDate(date, 'dd/MM/yyyy')).toThrow('Unsupported date format');
  });
});

describe('parseTimestamp', () => {
  it('parses PocketBase space-separated timestamps', () => {
    expect(parseTimestamp('2025-08-03 14:30:00.000Z').toISOString()).toBe(
      '2025-08-03T14:30:00.000Z'
    );
  });

  it('parses standard ISO timestamps', () => {
    expect(parseTimestamp('2025-08-03T14:30:00.000Z').toISOString()).toBe(
      '2025-08-03T14:30:00.000Z'
    );
  });
});

describe('isFutureDateOnly', () => {
  it.each([
    ['2026-10-04', false],
    ['2026-10-05', true],
    [' 2026-10-05 00:00:00.000Z ', true],
    ['', false],
    [null, false],
    [undefined, false],
    ['not-a-date', false],
    ['2026-02-31', false],
    [new Date(NaN), false],
    [new Date(2026, 9, 4, 23, 59), false],
    [new Date(2026, 9, 5), true],
  ])('checks %s against an explicit today', (value, expected) => {
    expect(isFutureDateOnly(value, '2026-10-04')).toBe(expected);
  });

  it('allows today in a user timezone ahead of the browser', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 23, 30));
    try {
      const browserToday = formatLocalDate(new Date(), 'yyyy-MM-dd');
      const userToday = getCurrentDateInUserTimezone('Pacific/Kiritimati');
      expect(browserToday).toBe('2026-10-04');
      expect(userToday).toBe('2026-10-05');
      expect(isFutureDateOnly(userToday, browserToday)).toBe(true);
      expect(isFutureDateOnly(userToday, userToday)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
