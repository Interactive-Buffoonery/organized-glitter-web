import type { ColoringBooksStatusOptions } from '@/types/pocketbase.types';

export const COLORING_BOOK_MAX_PAGES = 500;

export const COLORING_BOOK_STATUS_OPTIONS = [
  { value: 'wishlist', label: 'Wishlist' },
  { value: 'purchased', label: 'Purchased' },
  { value: 'in_stash', label: 'On Bookshelf (Not Started)' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
  { value: 'destashed', label: 'Destashed' },
] as const satisfies ReadonlyArray<{ value: ColoringBooksStatusOptions; label: string }>;

export const COLORING_BOOK_FORMAT_OPTIONS = [
  { value: 'paperback', label: 'Softcover' },
  { value: 'hardcover', label: 'Hardcover' },
  { value: 'pdf', label: 'PDF' },
  { value: 'printable_pages', label: 'Printable pages' },
  { value: 'magazine', label: 'Magazine' },
  { value: 'other', label: 'Other' },
] as const;

export const COLORING_BOOK_LANGUAGE_OPTIONS = [
  { value: 'english', label: 'English' },
  { value: 'spanish', label: 'Spanish' },
  { value: 'french', label: 'French' },
  { value: 'german', label: 'German' },
  { value: 'japanese', label: 'Japanese' },
  { value: 'other', label: 'Other' },
  { value: 'unknown', label: 'Unknown' },
] as const;

type OptionValue<T extends ReadonlyArray<{ value: string }>> = T[number]['value'];

export type ColoringBookFormat = OptionValue<typeof COLORING_BOOK_FORMAT_OPTIONS>;
export type ColoringBookLanguage = OptionValue<typeof COLORING_BOOK_LANGUAGE_OPTIONS>;

export const optionLabel = <T extends ReadonlyArray<{ value: string; label: string }>>(
  options: T,
  value?: string
) => options.find(option => option.value === value)?.label ?? '';
