import type { ProjectType } from '@/types/project';
import { formatDateOnlyForDisplay } from '@/utils/date/timezoneUtils';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'numeric',
  day: 'numeric',
  year: 'numeric',
});

export const getSizeAndShapeLabel = (project: ProjectType) => {
  const size =
    typeof project.width === 'number' && typeof project.height === 'number'
      ? `${project.width}×${project.height}`
      : null;
  const shape = project.drillShape
    ? project.drillShape[0].toUpperCase() + project.drillShape.slice(1)
    : null;

  if (size && shape) return `${size} · ${shape}`;
  if (size) return size;
  if (shape) return shape;

  return '-';
};

export interface LifecycleDate {
  label: string;
  value: string;
}

type LifecycleCandidate = { label: string; date?: string };

const firstAvailable = (candidates: LifecycleCandidate[]): LifecycleDate | null => {
  for (const candidate of candidates) {
    if (!candidate.date) continue;
    const formattedDateOnly = formatDateOnlyForDisplay(candidate.date);
    if (formattedDateOnly) return { label: candidate.label, value: formattedDateOnly };

    const parsed = new Date(candidate.date);
    if (Number.isNaN(parsed.getTime())) continue;
    return { label: candidate.label, value: dateFormatter.format(parsed) };
  }
  return null;
};

export const getLifecycleDate = (project: ProjectType): LifecycleDate | null => {
  const added: LifecycleCandidate = { label: 'Added', date: project.createdAt };
  const purchased: LifecycleCandidate = { label: 'Purchased', date: project.datePurchased };
  const received: LifecycleCandidate = { label: 'Received', date: project.dateReceived };
  const started: LifecycleCandidate = { label: 'Started', date: project.dateStarted };
  const finished: LifecycleCandidate = { label: 'Finished', date: project.dateCompleted };

  switch (project.status) {
    case 'wishlist':
      return firstAvailable([added]);
    case 'purchased':
      return firstAvailable([purchased, added]);
    case 'stash':
    case 'kitted':
      return firstAvailable([received, purchased, added]);
    case 'progress':
    case 'onhold':
      return firstAvailable([started, received, purchased, added]);
    case 'completed':
      return firstAvailable([finished, started, received, purchased, added]);
    case 'destashed':
      return firstAvailable([purchased, added]);
    case 'archived':
      return firstAvailable([finished, started, received, purchased, added]);
    default:
      return firstAvailable([purchased, added]);
  }
};
