import { describe, expect, it } from 'vitest';
import { getProjectDayLabel, getVisibleProjectDates, formatKitDate } from './projectDetailDates';
import type { ProjectType } from '@/types/project';
const project: ProjectType = {
  id: 'kit',
  userId: 'owner',
  title: 'Fox',
  status: 'progress',
  createdAt: '',
  updatedAt: '',
};
describe('project journal dates', () => {
  it('counts calendar days across daylight saving changes', () => {
    expect(getProjectDayLabel({ ...project, dateStarted: '2026-03-07' }, '2026-03-09')).toBe(
      'Day 3'
    );
  });
  it('freezes the duration for a finished kit', () => {
    expect(
      getProjectDayLabel(
        { ...project, status: 'completed', dateStarted: '2026-03-07', dateCompleted: '2026-03-09' },
        '2026-10-26'
      )
    ).toBe('Finished in 3 days');
  });
  it('does not invent a day counter without a valid start date', () => {
    expect(getProjectDayLabel(project, '2026-10-26')).toBeNull();
    expect(getProjectDayLabel({ ...project, dateStarted: '2027-01-01' }, '2026-10-26')).toBeNull();
  });
  it('shows all dates when none are missing', () => {
    expect(
      getVisibleProjectDates({
        ...project,
        datePurchased: '2026-01-01',
        dateReceived: '2026-01-02',
        dateStarted: '2026-01-03',
        dateCompleted: '2026-01-04',
      })
    ).toHaveLength(4);
  });
});

it('formats a compact saved date without losing its calendar day', () => {
  expect(formatKitDate('2026-01-12', 'America/New_York')).toBe('Jan 12');
});
