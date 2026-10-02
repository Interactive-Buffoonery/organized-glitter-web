import type { OverviewFeedItem } from '@/services/pocketbase/overview.service';

export type OverviewSortId = 'recent_activity' | 'oldest_activity' | 'name_asc' | 'name_desc';

export interface OverviewSortOption {
  id: OverviewSortId;
  label: string;
  description: string;
}

export const DEFAULT_OVERVIEW_SORT: OverviewSortId = 'recent_activity';

export const OVERVIEW_SORT_OPTIONS: OverviewSortOption[] = [
  {
    id: 'recent_activity',
    label: 'Recent activity',
    description: 'Newest activity first',
  },
  {
    id: 'oldest_activity',
    label: 'Oldest activity',
    description: 'Oldest activity first',
  },
  {
    id: 'name_asc',
    label: 'Name A to Z',
    description: 'Project or book name ascending',
  },
  {
    id: 'name_desc',
    label: 'Name Z to A',
    description: 'Project or book name descending',
  },
];

const titleCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

const compareSortAt = (a: OverviewFeedItem, b: OverviewFeedItem, direction: 'asc' | 'desc') => {
  const aTime = new Date(a.sortAt).getTime();
  const bTime = new Date(b.sortAt).getTime();
  const comparison = aTime - bTime;
  return direction === 'asc' ? comparison : -comparison;
};

const compareKey = (a: OverviewFeedItem, b: OverviewFeedItem) => a.key.localeCompare(b.key);

const compareTitle = (a: OverviewFeedItem, b: OverviewFeedItem, direction: 'asc' | 'desc') => {
  const comparison = titleCollator.compare(a.sortTitle, b.sortTitle);
  return direction === 'asc' ? comparison : -comparison;
};

export function sortOverviewItems(
  items: OverviewFeedItem[],
  sortId: OverviewSortId
): OverviewFeedItem[] {
  return [...items].sort((a, b) => {
    if (sortId === 'oldest_activity') {
      return compareSortAt(a, b, 'asc') || compareKey(a, b);
    }

    if (sortId === 'name_asc') {
      return compareTitle(a, b, 'asc') || compareSortAt(a, b, 'desc') || compareKey(a, b);
    }

    if (sortId === 'name_desc') {
      return compareTitle(a, b, 'desc') || compareSortAt(a, b, 'desc') || compareKey(a, b);
    }

    return compareSortAt(a, b, 'desc') || compareKey(a, b);
  });
}
