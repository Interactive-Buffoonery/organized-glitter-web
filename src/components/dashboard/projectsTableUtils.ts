import type { ProjectType } from '@/types/project';
import type { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';
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

export interface GridMetadataLine {
  text: string;
  tabularNums: boolean;
}

const EMPTY_METADATA: GridMetadataLine = { text: '', tabularNums: false };

const lifecycleAsMetadata = (project: ProjectType): GridMetadataLine => {
  const lifecycle = getLifecycleDate(project);
  if (!lifecycle) return EMPTY_METADATA;
  return { text: `${lifecycle.label} ${lifecycle.value}`, tabularNums: true };
};

export const getGridMetadataLine = (
  project: ProjectType,
  sortField: DashboardValidSortField
): GridMetadataLine => {
  switch (sortField) {
    case 'company':
      return project.company ? { text: project.company, tabularNums: false } : EMPTY_METADATA;
    case 'artist': {
      const artist = project.artist && project.artist !== '-' ? project.artist : null;
      return artist ? { text: artist, tabularNums: false } : EMPTY_METADATA;
    }
    case 'width':
      return typeof project.width === 'number' && typeof project.height === 'number'
        ? { text: `${project.width}×${project.height}`, tabularNums: true }
        : EMPTY_METADATA;
    case 'last_updated':
    case 'date_purchased':
    case 'date_finished':
    case 'date_started':
    case 'date_received':
    case 'kit_name':
    case 'status':
      return lifecycleAsMetadata(project);
    default: {
      const exhaustiveCheck: never = sortField;
      void exhaustiveCheck;
      return lifecycleAsMetadata(project);
    }
  }
};
