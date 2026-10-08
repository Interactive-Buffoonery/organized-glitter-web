import {
  COLORING_BOOK_FORMAT_OPTIONS,
  COLORING_BOOK_LANGUAGE_OPTIONS,
  optionLabel,
} from '@/constants/coloringBookMetadata';
import { formatDateOnlyForDisplay } from '@/utils/date/timezoneUtils';
import { countUnit } from '@/utils/countUnit';
import type { ColoringBookCardData } from './coloringBookCardTypes';

export const formatColoringCompletionPercent = (book: ColoringBookCardData): string =>
  `${Math.round(book.completionPercentage ?? 0)}%`;

const getColoringCompletedPages = (book: ColoringBookCardData): number =>
  Math.max(0, Math.min(book.completedPages ?? 0, book.totalPages));

export const getColoringProgressLabel = (book: ColoringBookCardData): string =>
  `${getColoringCompletedPages(book)} of ${book.totalPages} ${countUnit(book.totalPages, 'page')}`;

export const getColoringPublisherLabel = (book: ColoringBookCardData): string =>
  book.publisherName || book.series || 'No publisher';

export const getColoringBookFormatLabel = (book: Pick<ColoringBookCardData, 'bookFormat'>) =>
  optionLabel(COLORING_BOOK_FORMAT_OPTIONS, book.bookFormat) || 'No format';

export const getColoringBookLanguageLabel = (value?: string) =>
  optionLabel(COLORING_BOOK_LANGUAGE_OPTIONS, value);

export const formatColoringBookDate = (value?: string) => {
  if (!value) return '';
  return formatDateOnlyForDisplay(value) || new Date(value).toLocaleDateString();
};

export const getColoringActivityLabel = (book: ColoringBookCardData): string => {
  const value = book.lastActivityAt || book.updatedAt || book.createdAt;
  if (!value) return 'No activity yet';
  return new Date(value).toLocaleDateString();
};
