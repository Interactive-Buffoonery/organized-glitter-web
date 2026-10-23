import { describe, expect, it } from 'vitest';
import { formatDateOnlyForDisplay, isFutureDateOnly } from './timezoneUtils';

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

  it('rejects invalid date-only calendar values', () => {
    expect(formatDateOnlyForDisplay('2026-02-31', 'M/d/yyyy')).toBe('');
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
});
