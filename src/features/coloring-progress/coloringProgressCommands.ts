import { formatLocalDate, parseDateOnlyAsLocalDate } from '@/utils/date/timezoneUtils';
import type {
  ColoringPageDTO,
  UpdateColoringPageInput,
} from '@/services/pocketbase/coloring.service';
import type { ColoringPagesStatusOptions } from '@/types/pocketbase.types';

export type ColoringPageCommand =
  | { type: 'set-status'; status: ColoringPagesStatusOptions }
  | { type: 'set-started-date'; startedAt: string }
  | { type: 'set-completed-date'; completedAt: string }
  | { type: 'add-photos'; files: File[] }
  | { type: 'delete-photo'; filename: string }
  | { type: 'set-main-photo'; filename: string }
  | { type: 'set-mediums'; mediumIds: string[] }
  | { type: 'reveal-mystery'; revealedSubject: string; revealedAt: string }
  | { type: 'clear-mystery-reveal' };

type ColoringPagePatchCommand = Exclude<ColoringPageCommand, { type: 'set-main-photo' }>;

export interface ColoringPageCommandEffects {
  shouldOptimisticallyUpdateDetail: boolean;
  shouldRefreshPageDetail: boolean;
  shouldRefreshPageLists: boolean;
  shouldRefreshBookProgress: boolean;
  shouldTrackStatusChange: boolean;
  shouldTrackPhotoDelta: boolean;
  shouldTrackMysteryReveal: boolean;
}

const pageOnlyEffects = {
  shouldOptimisticallyUpdateDetail: false,
  shouldRefreshPageDetail: true,
  shouldRefreshPageLists: true,
  shouldRefreshBookProgress: false,
  shouldTrackStatusChange: false,
  shouldTrackPhotoDelta: false,
  shouldTrackMysteryReveal: false,
} satisfies ColoringPageCommandEffects;

const commandEffectsByType = {
  'set-status': {
    ...pageOnlyEffects,
    shouldOptimisticallyUpdateDetail: true,
    shouldRefreshBookProgress: true,
    shouldTrackStatusChange: true,
  },
  'set-started-date': {
    ...pageOnlyEffects,
    shouldOptimisticallyUpdateDetail: true,
  },
  'set-completed-date': {
    ...pageOnlyEffects,
    shouldOptimisticallyUpdateDetail: true,
    shouldRefreshBookProgress: true,
    shouldTrackStatusChange: true,
  },
  'add-photos': {
    ...pageOnlyEffects,
    shouldTrackPhotoDelta: true,
  },
  'delete-photo': {
    ...pageOnlyEffects,
    shouldTrackPhotoDelta: true,
  },
  'set-main-photo': {
    ...pageOnlyEffects,
    shouldTrackPhotoDelta: true,
  },
  'set-mediums': {
    ...pageOnlyEffects,
    shouldOptimisticallyUpdateDetail: true,
  },
  'reveal-mystery': {
    ...pageOnlyEffects,
    shouldTrackMysteryReveal: true,
  },
  'clear-mystery-reveal': pageOnlyEffects,
} satisfies Record<ColoringPageCommand['type'], ColoringPageCommandEffects>;

export const getColoringPageCommandEffects = (
  command: ColoringPageCommand
): ColoringPageCommandEffects => ({ ...commandEffectsByType[command.type] });

const rejectUnsupportedPatchCommand = (command: never): never => {
  const commandType = (command as ColoringPageCommand).type;
  if (commandType === 'set-main-photo') {
    throw new Error('Set-main-photo commands must use the dedicated main-photo route.');
  }

  throw new Error(`Unsupported coloring page patch command: ${String(commandType)}`);
};

export const buildColoringPagePatch = (
  command: ColoringPagePatchCommand
): UpdateColoringPageInput => {
  switch (command.type) {
    case 'set-status':
      return { status: command.status };
    case 'set-started-date':
      return { started_at: command.startedAt };
    case 'set-completed-date':
      return { completed_at: command.completedAt };
    case 'add-photos':
      return { 'photos+': command.files };
    case 'delete-photo':
      return { 'photos-': [command.filename] };
    case 'set-mediums':
      return { mediums: command.mediumIds };
    case 'reveal-mystery':
      return {
        revealed_subject: command.revealedSubject,
        revealed_at: command.revealedAt,
      };
    case 'clear-mystery-reveal':
      return {
        revealed_subject: '',
        revealed_at: '',
      };
    default:
      return rejectUnsupportedPatchCommand(command);
  }
};

export const getColoringPageLifecycleDateRangeError = (
  startedAt: string | undefined,
  completedAt: string | undefined
): string | null => {
  const today = formatLocalDate(new Date(), 'yyyy-MM-dd');
  for (const [value, label] of [
    [startedAt, 'Started'],
    [completedAt, 'Completed'],
  ] as const) {
    const date = value ? parseDateOnlyAsLocalDate(value) : null;
    if (date && formatLocalDate(date, 'yyyy-MM-dd') > today) {
      return `${label} date cannot be in the future.`;
    }
  }

  if (startedAt && completedAt && completedAt < startedAt) {
    return 'Completed date cannot be before started date.';
  }

  return null;
};

export const assertColoringPageLifecycleDateRange = (
  command: ColoringPageCommand,
  currentPage: Pick<ColoringPageDTO, 'startedAt' | 'completedAt'> | undefined
) => {
  if (command.type !== 'set-started-date' && command.type !== 'set-completed-date') return;

  const startedAt =
    command.type === 'set-started-date' ? command.startedAt : currentPage?.startedAt;
  const completedAt =
    command.type === 'set-completed-date' ? command.completedAt : currentPage?.completedAt;

  const rangeError = getColoringPageLifecycleDateRangeError(startedAt, completedAt);
  if (rangeError) {
    throw new Error(rangeError);
  }
};

export const applyColoringPageOptimisticPatch = (
  previousPage: ColoringPageDTO,
  patch: UpdateColoringPageInput
): ColoringPageDTO => ({
  ...previousPage,
  // Photo patches deliberately skip optimistic updates; photo commands refetch after settling.
  ...(patch.status !== undefined ? { status: patch.status } : {}),
  ...(patch.mediums !== undefined ? { mediumIds: patch.mediums } : {}),
  ...(patch.started_at !== undefined ? { startedAt: patch.started_at } : {}),
  ...(patch.completed_at !== undefined ? { completedAt: patch.completed_at } : {}),
  ...(patch.revealed_subject !== undefined
    ? {
        revealedSubject: patch.revealed_subject,
        revealedAt: patch.revealed_at ?? previousPage.revealedAt,
      }
    : {}),
});
