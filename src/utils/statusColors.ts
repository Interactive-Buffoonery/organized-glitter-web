import type { ProjectFilterStatus, ProjectStatus } from '@/types/project';
import type {
  ColoringBooksStatusOptions,
  ColoringPagesStatusOptions,
} from '@/types/pocketbase.types';

export const FILTER_STATUS_ACTIVE_FILL: Record<ProjectFilterStatus, string> = {
  everything: 'bg-primary text-primary-foreground',
  wishlist: 'bg-rose-500 text-white dark:bg-rose-600',
  purchased: 'bg-sky-500 text-white dark:bg-sky-600',
  stash: 'bg-orange-500 text-white dark:bg-orange-600',
  kitted: 'bg-teal-500 text-white dark:bg-teal-600',
  progress: 'bg-diamond-500 text-white dark:bg-diamond-600',
  onhold: 'bg-amber-500 text-white dark:bg-amber-600',
  completed: 'bg-emerald-500 text-white dark:bg-emerald-600',
  archived: 'bg-muted-foreground text-background',
  destashed: 'bg-rose-500 text-white dark:bg-rose-600',
};

export const FILTER_STATUS_DOT: Record<ProjectFilterStatus, string> = {
  everything: 'bg-primary',
  wishlist: 'bg-rose-500',
  purchased: 'bg-sky-500',
  stash: 'bg-orange-500',
  kitted: 'bg-teal-500',
  progress: 'bg-diamond-500',
  onhold: 'bg-amber-500',
  completed: 'bg-emerald-500',
  archived: 'bg-muted-foreground',
  destashed: 'bg-rose-500',
};

export const PROJECT_STATUS_DOT: Record<ProjectStatus, string> = {
  wishlist: FILTER_STATUS_DOT.wishlist,
  purchased: FILTER_STATUS_DOT.purchased,
  stash: FILTER_STATUS_DOT.stash,
  kitted: FILTER_STATUS_DOT.kitted,
  progress: FILTER_STATUS_DOT.progress,
  onhold: FILTER_STATUS_DOT.onhold,
  completed: FILTER_STATUS_DOT.completed,
  archived: FILTER_STATUS_DOT.archived,
  destashed: FILTER_STATUS_DOT.destashed,
};

const COLORING_BOOK_STATUS_FILL: Record<ColoringBooksStatusOptions, string> = {
  wishlist: 'bg-rose-500 text-white dark:bg-rose-600',
  purchased: 'bg-sky-500 text-white dark:bg-sky-600',
  in_stash: 'bg-orange-500 text-white dark:bg-orange-600',
  in_progress: 'bg-diamond-500 text-white dark:bg-diamond-600',
  completed: 'bg-emerald-500 text-white dark:bg-emerald-600',
  archived: 'bg-muted-foreground text-background',
  destashed: 'bg-rose-500 text-white dark:bg-rose-600',
};

export const COLORING_BOOK_STATUS_LABEL: Record<ColoringBooksStatusOptions, string> = {
  wishlist: 'Wishlist',
  purchased: 'Purchased',
  in_stash: 'On Bookshelf (Not Started)',
  in_progress: 'In progress',
  completed: 'Completed',
  archived: 'Archived',
  destashed: 'Destashed',
};

export function getColoringBookStatusColor(status: ColoringBooksStatusOptions): string {
  return COLORING_BOOK_STATUS_FILL[status];
}

export function getColoringBookStatusLabel(status: ColoringBooksStatusOptions): string {
  return COLORING_BOOK_STATUS_LABEL[status];
}

export const COLORING_PAGE_STATUS_LABEL: Record<ColoringPagesStatusOptions, string> = {
  not_started: 'Not started',
  palette_chosen: 'Palette chosen',
  in_progress: 'In progress',
  on_hold: 'On hold',
  completed: 'Completed',
};

export function getColoringPageStatusLabel(status: ColoringPagesStatusOptions): string {
  return COLORING_PAGE_STATUS_LABEL[status];
}
