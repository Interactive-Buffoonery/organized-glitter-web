import { parseDateOnlyAsLocalDate, parseTimestamp } from '@/utils/date/timezoneUtils';
import type { ProjectType } from '@/types/project';

export function formatKitMetadata(
  project: Partial<Pick<ProjectType, 'company' | 'width' | 'height' | 'drillShape'>>
) {
  return [
    project.company,
    typeof project.width === 'number' && typeof project.height === 'number'
      ? `${project.width}x${project.height}`
      : undefined,
    project.drillShape
      ? project.drillShape[0].toUpperCase() + project.drillShape.slice(1)
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function formatLibraryDate(value: string, today = new Date()) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? parseDateOnlyAsLocalDate(value)
    : parseTimestamp(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  if (date.toDateString() === today.toDateString()) return 'Today';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}
