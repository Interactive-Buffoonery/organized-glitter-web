import { createFilter } from '@/services/pocketbase/base/filterBuilder';
import type {
  ColoringFilterState,
  ColoringSortDirection,
  ColoringSortField,
} from '@/contexts/ColoringFilterContext';
import type { ColoringBooksStatusOptions } from '@/types/pocketbase.types';

export type ColoringBookListFilterInput = Pick<
  ColoringFilterState,
  | 'selectedStatuses'
  | 'selectedPublishers'
  | 'selectedIllustrators'
  | 'selectedTags'
  | 'mysteryOnly'
  | 'includeArchived'
  | 'includeDestashed'
  | 'searchTerm'
>;

export type ColoringBookListCriteria = {
  statuses: ColoringBooksStatusOptions[];
  publisherIds: string[];
  illustratorIds: string[];
  tagIds: string[];
  mysteryOnly: boolean;
  includeArchived: boolean;
  includeDestashed: boolean;
  searchTerm?: string;
};

export type ColoringBookListSort = {
  field: ColoringSortField;
  direction: ColoringSortDirection;
};

export type ColoringBookListQueryConfig = {
  filter: string;
  sort: string;
  expand: string;
};

const COLORING_BOOK_EXPAND = 'publisher,illustrator';

const SORT_FIELD_MAP: Record<ColoringSortField, string> = {
  date_added: 'created',
  title: 'title',
  publisher: 'publisher',
  completion: 'completion_percentage',
  last_activity: 'last_activity_at',
};

const SEARCH_FIELDS = [
  'title',
  'publisher.name',
  'illustrator.name',
  'series',
  'theme',
  'isbn',
  'source_url',
  'notes',
] as const;

export function toColoringBookListCriteria(
  input: ColoringBookListFilterInput
): ColoringBookListCriteria {
  const searchTerm = input.searchTerm.trim();

  return {
    statuses: input.selectedStatuses,
    publisherIds: input.selectedPublishers,
    illustratorIds: input.selectedIllustrators,
    tagIds: input.selectedTags,
    mysteryOnly: input.mysteryOnly,
    includeArchived: input.selectedStatuses.length === 0 && input.includeArchived,
    includeDestashed: input.selectedStatuses.length === 0 && input.includeDestashed,
    searchTerm: searchTerm || undefined,
  };
}

export function buildColoringBookListFilter(criteria: ColoringBookListCriteria): string {
  const builder = createFilter();

  if (criteria.statuses.length > 0) {
    builder.in('status', criteria.statuses);
  } else {
    if (!criteria.includeArchived) builder.notEquals('status', 'archived');
    if (!criteria.includeDestashed) builder.notEquals('status', 'destashed');
  }

  if (criteria.publisherIds.length > 0) {
    builder.in('publisher', criteria.publisherIds);
  }

  if (criteria.illustratorIds.length > 0) {
    builder.in('illustrator', criteria.illustratorIds);
  }

  if (criteria.tagIds.length > 0) {
    builder.any('coloring_book_tags_via_book.tag', criteria.tagIds);
  }

  if (criteria.mysteryOnly) {
    builder.equals('is_mystery', true);
  }

  if (criteria.searchTerm) {
    builder.search({
      fields: [...SEARCH_FIELDS],
      term: criteria.searchTerm,
    });
  }

  return builder.build();
}

export function buildColoringBookListSort(sort: ColoringBookListSort): string {
  const sortField = SORT_FIELD_MAP[sort.field];
  const sortPrefix = sort.direction === 'desc' ? '-' : '+';

  return `${sortPrefix}${sortField},+id`;
}

export function buildColoringBookListQueryConfig(
  criteria: ColoringBookListCriteria,
  sort: ColoringBookListSort
): ColoringBookListQueryConfig {
  return {
    filter: buildColoringBookListFilter(criteria),
    sort: buildColoringBookListSort(sort),
    expand: COLORING_BOOK_EXPAND,
  };
}
