import { formatDateInUserTimezone } from '@/utils/date/timezoneUtils';
import type { ProjectType } from '@/types/project';
import type { DateFieldKey } from '@/hooks/mutations/projectCommands';
import { getDateFieldSelectedDate } from '@/components/ui/date-field-utils';
import { getActivityDayLabel } from '@/components/shared/activityDayLabel';

export const PROJECT_DATES: { key: DateFieldKey; label: string; addLabel: string }[] = [
  { key: 'datePurchased', label: 'Bought', addLabel: 'add purchase date' },
  { key: 'dateReceived', label: 'Arrived', addLabel: 'add received date' },
  { key: 'dateStarted', label: 'Started', addLabel: 'add start date' },
  { key: 'dateCompleted', label: 'Finished', addLabel: 'add finish date' },
];

export function getVisibleProjectDates(project: ProjectType) {
  const nextMissing = PROJECT_DATES.find(date => !project[date.key]);
  return PROJECT_DATES.filter(date => project[date.key] || date === nextMissing);
}

export function getProjectDayLabel(project: ProjectType, today: string) {
  if (project.status === 'completed') {
    return getActivityDayLabel(project.dateStarted, project.dateCompleted, true);
  }
  return project.status === 'progress' || project.status === 'onhold'
    ? getActivityDayLabel(project.dateStarted, project.dateCompleted || today, false)
    : null;
}

export function formatKitDate(value: string, timezone: string) {
  const date = getDateFieldSelectedDate(formatDateInUserTimezone(value, timezone, 'yyyy-MM-dd'));
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
}
