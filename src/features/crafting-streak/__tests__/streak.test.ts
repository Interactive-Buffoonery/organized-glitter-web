import { describe, expect, it } from 'vitest';
import cases from './cases.json';
import { craftingStreak, craftingWeek, savedDay, slotDay } from '../streak';

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

describe('activity slots and the visible week', () => {
  it('names a slot by its local day', () => {
    expect(slotDay('2026-11-14 03:30:00.000Z', 'UTC')).toBe('2026-11-14');
    expect(slotDay('2026-11-14 03:30:00.000Z', 'America/Los_Angeles')).toBe('2026-11-13');
    expect(slotDay('2026-11-14 18:00:00.000Z', 'Asia/Tokyo')).toBe('2026-11-15');
    expect(slotDay('not a slot', 'UTC')).toBeNull();
  });

  it('builds the seven days ending today with activity winning over a mark', () => {
    const week = craftingWeek(
      {
        activityDays: ['2026-11-14', '2026-11-12', '2026-11-01'],
        marks: [
          { id: 'mark-active', day: '2026-11-12' },
          { id: 'mark-11', day: '2026-11-11' },
          { id: 'mark-old', day: '2026-11-01' },
        ],
      },
      new Date('2026-11-14T15:00:00Z'),
      'UTC'
    );
    expect(week).toEqual([
      { day: '2026-11-08', status: 'none', isToday: false },
      { day: '2026-11-09', status: 'none', isToday: false },
      { day: '2026-11-10', status: 'none', isToday: false },
      { day: '2026-11-11', status: 'marked', isToday: false, markId: 'mark-11' },
      { day: '2026-11-12', status: 'activity', isToday: false },
      { day: '2026-11-13', status: 'none', isToday: false },
      { day: '2026-11-14', status: 'activity', isToday: true },
    ]);
  });

  it('ends the week on the local day', () => {
    const week = craftingWeek(
      { activityDays: [], marks: [] },
      new Date('2026-11-14T03:00:00Z'),
      'America/Los_Angeles'
    );
    expect(week.at(-1)).toEqual({ day: '2026-11-13', status: 'none', isToday: true });
    expect(week[0].day).toBe('2026-11-07');
  });
});
