import type {
  ColoringBookDTO,
  ColoringPageDTO,
  CreateColoringBookInput,
  UpdateColoringBookInput,
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
  book: ColoringBookDTO | CreateColoringBookInput | UpdateColoringBookInput,
  properties: AnalyticsProperties = {}
): AnalyticsProperties => {
  const dto = book as ColoringBookDTO;
  const input = book as CreateColoringBookInput;
  const totalPages = dto.totalPages ?? input.total_pages;
  const coverImage = dto.coverImage ?? input.cover_image;
  const publisher = dto.publisherId ?? input.publisher;
  const illustrator = dto.illustratorId ?? input.illustrator;
  const notes = dto.notes ?? input.notes ?? '';
  const tags = dto.tags ?? [];

  return {
    craft: 'coloring',
    status: dto.status ?? input.status,
    total_pages_bucket: pageCountBucket(totalPages),
    has_cover_image: Boolean(coverImage),
    has_publisher: Boolean(publisher),
    has_illustrator: Boolean(illustrator),
    has_series: Boolean(dto.series ?? input.series),
    has_theme: Boolean(dto.theme ?? input.theme),
    has_notes: notes.trim().length > 0,
    note_length_bucket: lengthBucket(notes.trim().length),
    is_mystery: Boolean(dto.isMystery ?? input.is_mystery),
    tag_count: tags.length,
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
