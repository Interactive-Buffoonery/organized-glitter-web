import { CheckCircle2, Circle, Clock3, Palette, PauseCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import type { ColoringPagesStatusOptions } from '@/types/pocketbase.types';
import { getColoringPageStatusLabel } from '@/utils/statusColors';

export type ContactSheetCellVariant = 'photo' | 'empty' | 'mystery-unrevealed' | 'mystery-revealed';

const COLORING_PAGE_STATUS_ICON: Record<ColoringPagesStatusOptions, LucideIcon> = {
  not_started: Circle,
  palette_chosen: Palette,
  in_progress: Clock3,
  on_hold: PauseCircle,
  completed: CheckCircle2,
};

const COLORING_PAGE_STATUS_EDGE: Record<ColoringPagesStatusOptions, string> = {
  not_started: 'border-b-muted-foreground/35',
  palette_chosen: 'border-b-sky-500',
  in_progress: 'border-b-diamond-500',
  on_hold: 'border-b-amber-500',
  completed: 'border-b-emerald-500',
};

const COLORING_PAGE_STATUS_TEXT: Record<ColoringPagesStatusOptions, string> = {
  not_started: 'text-muted-foreground',
  palette_chosen: 'text-sky-600 dark:text-sky-300',
  in_progress: 'text-diamond-600 dark:text-diamond-300',
  on_hold: 'text-amber-600 dark:text-amber-300',
  completed: 'text-emerald-600 dark:text-emerald-300',
};

export function getColoringPageStatusPresentation(status: ColoringPagesStatusOptions) {
  return {
    label: getColoringPageStatusLabel(status),
    Icon: COLORING_PAGE_STATUS_ICON[status],
    edgeClassName: COLORING_PAGE_STATUS_EDGE[status],
    textClassName: COLORING_PAGE_STATUS_TEXT[status],
  };
}

export function getContactSheetCellVariant(
  page: Pick<ColoringPageDTO, 'photos' | 'revealedSubject'>,
  isMysteryBook: boolean
): ContactSheetCellVariant {
  const hasPhoto = page.photos.length > 0;
  if (!isMysteryBook) return hasPhoto ? 'photo' : 'empty';
  if (page.revealedSubject) return hasPhoto ? 'mystery-revealed' : 'empty';
  return 'mystery-unrevealed';
}

export function getColoringPageStatusAriaLabel(status: ColoringPagesStatusOptions): string {
  return `Status: ${getColoringPageStatusLabel(status)}`;
}
