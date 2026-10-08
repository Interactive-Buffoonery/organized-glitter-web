import type {
  ColoringBookDTO,
  ColoringPageDTO,
  UpdateColoringPageInput,
} from '@/services/pocketbase/coloring.service';

type AnalyticsProperties = Record<string, unknown>;

const lengthBucket = (length: number): string => {
  if (length === 0) return '0';
  if (length <= 25) return '1-25';
  if (length <= 100) return '26-100';
  if (length <= 500) return '101-500';
  return '501+';
};

const pageCountBucket = (totalPages?: number): string => {
  if (!totalPages || totalPages <= 0) return 'unknown';
  if (totalPages <= 25) return '1-25';
  if (totalPages <= 50) return '26-50';
  if (totalPages <= 100) return '51-100';
  if (totalPages <= 200) return '101-200';
  return '201+';
};

export const getSearchAnalyticsProperties = (
  term: string,
  properties: AnalyticsProperties = {}
): AnalyticsProperties => ({
  term_length: term.trim().length,
  ...properties,
});

export const getColoringBookAnalyticsProperties = (
  book: ColoringBookDTO,
  properties: AnalyticsProperties = {}
): AnalyticsProperties => {
  const notes = book.notes ?? '';

  return {
    craft: 'coloring',
    status: book.status,
    total_pages_bucket: pageCountBucket(book.totalPages),
    has_cover_image: Boolean(book.coverImage),
    has_publisher: Boolean(book.publisherId),
    has_illustrator: Boolean(book.illustratorId),
    has_series: Boolean(book.series),
    has_theme: Boolean(book.theme),
    has_notes: notes.trim().length > 0,
    note_length_bucket: lengthBucket(notes.trim().length),
    is_mystery: Boolean(book.isMystery),
    tag_count: book.tags?.length ?? 0,
    ...properties,
  };
};

export const getColoringPageAnalyticsProperties = (
  page: ColoringPageDTO | undefined,
  patch?: UpdateColoringPageInput,
  properties: AnalyticsProperties = {}
): AnalyticsProperties => {
  const photos = patch?.photos ?? page?.photos ?? [];
  const mediumIds = patch?.mediums ?? page?.mediumIds ?? [];

  return {
    craft: 'coloring',
    status: patch?.status ?? page?.status,
    photo_count: photos.length,
    has_photos: photos.length > 0,
    medium_count: mediumIds.length,
    is_revealed: Boolean(patch?.revealed_subject ?? page?.revealedSubject),
    ...properties,
  };
};
