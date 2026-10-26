import { formatDateInUserTimezone } from '@/utils/date/timezoneUtils';
import type { ProjectType } from '@/types/project';
import type { DateFieldKey } from '@/hooks/mutations/projectCommands';
import { getDateFieldSelectedDate } from '@/components/ui/date-field-utils';

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
  if (!project.dateStarted) return null;
  const start = getDateFieldSelectedDate(project.dateStarted.slice(0, 10));
  const end = getDateFieldSelectedDate((project.dateCompleted || today).slice(0, 10));
  if (!start || !end) return null;
  const day =
    Math.floor(
      (Date.UTC(end.year, end.month - 1, end.day) -
        Date.UTC(start.year, start.month - 1, start.day)) /
        86400000
    ) + 1;
  if (day < 1) return null;
  if (project.status === 'completed' && project.dateCompleted)
    return `Finished in ${day} ${day === 1 ? 'day' : 'days'}`;
  return project.status === 'progress' || project.status === 'onhold' ? `Day ${day}` : null;
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
