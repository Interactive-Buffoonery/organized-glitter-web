import { describe, expect, it } from 'vitest';
import cases from './cases.json';
import { craftingStreak, savedDay } from '../streak';

describe('native and web streak contract', () => {
  it.each(cases)('$id', ({ noteDates, now, timeZone, expected }) => {
    expect(craftingStreak(noteDates, new Date(now), timeZone)).toBe(expected);
  });
  it('preserves a PocketBase timestamp’s named day', () => {
    expect(savedDay('2026-10-03 00:00:00.000Z')).toBe('2026-10-03');
    expect(savedDay('2026-10-03T00:00:00Z')).toBe('2026-10-03');
    expect(savedDay('2026-02-30 00:00:00.000Z')).toBeNull();
    expect(savedDay('2026-10-03junk')).toBeNull();
  });
});
