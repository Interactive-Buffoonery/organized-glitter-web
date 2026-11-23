import { getDateFieldSelectedDate } from '@/components/ui/date-field-utils';

export function getActivityDayLabel(
  startedAt: string | undefined,
  endedAt: string | undefined,
  isCompleted: boolean
) {
  if (!startedAt || !endedAt) return null;
  const start = getDateFieldSelectedDate(startedAt.slice(0, 10));
  const end = getDateFieldSelectedDate(endedAt.slice(0, 10));
  if (!start || !end) return null;
  const elapsedDays =
    (Date.UTC(end.year, end.month - 1, end.day) -
      Date.UTC(start.year, start.month - 1, start.day)) /
    86400000;
  if (elapsedDays < 0) return null;
  if (!isCompleted) return `Day ${elapsedDays + 1}`;
  if (elapsedDays === 0) return 'Finished same day';
  return `Finished in ${elapsedDays} ${elapsedDays === 1 ? 'day' : 'days'}`;
}
