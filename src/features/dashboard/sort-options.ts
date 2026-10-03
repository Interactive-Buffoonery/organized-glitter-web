import { SORT_FIELD_TO_FRIENDLY_NAME, type DashboardValidSortField } from './dashboard.constants';

export type SortDirection = 'asc' | 'desc';

export interface SortOption {
  id: string;
  field: DashboardValidSortField;
  direction: SortDirection;
  label: string;
  subtitle: string;
}

export interface SortOptionGroup {
  id: string;
  heading: string;
  options: SortOption[];
}

export const SORT_OPTION_GROUPS: SortOptionGroup[] = [
  {
    id: 'activity',
    heading: 'Recent Activity',
    options: [
      {
        id: 'last_updated_desc',
        field: 'last_updated',
        direction: 'desc',
        label: 'Last Updated',
        subtitle: 'Most recently changed first',
      },
      {
        id: 'last_updated_asc',
        field: 'last_updated',
        direction: 'asc',
        label: 'Oldest Activity',
        subtitle: 'Longest since last change',
      },
    ],
  },
  {
    id: 'date',
    heading: 'By Date',
    options: [
      {
        id: 'date_purchased_desc',
        field: 'date_purchased',
        direction: 'desc',
        label: 'Recently Purchased',
        subtitle: 'Newest purchases first',
      },
      {
        id: 'date_purchased_asc',
        field: 'date_purchased',
        direction: 'asc',
        label: 'Earliest Purchased',
        subtitle: 'Oldest purchases first',
      },
      {
        id: 'date_started_desc',
        field: 'date_started',
        direction: 'desc',
        label: 'Recently Started',
        subtitle: 'Most recently started',
      },
      {
        id: 'date_started_asc',
        field: 'date_started',
        direction: 'asc',
        label: 'Earliest Started',
        subtitle: 'Started longest ago',
      },
      {
        id: 'date_finished_desc',
        field: 'date_finished',
        direction: 'desc',
        label: 'Recently Finished',
        subtitle: 'Most recently completed',
      },
      {
        id: 'date_finished_asc',
        field: 'date_finished',
        direction: 'asc',
        label: 'Earliest Finished',
        subtitle: 'Finished longest ago',
      },
      {
        id: 'date_received_desc',
        field: 'date_received',
        direction: 'desc',
        label: 'Recently Received',
        subtitle: 'Most recently delivered',
      },
      {
        id: 'date_received_asc',
        field: 'date_received',
        direction: 'asc',
        label: 'Earliest Received',
        subtitle: 'Received longest ago',
      },
    ],
  },
  {
    id: 'name',
    heading: 'By Name',
    options: [
      {
        id: 'kit_name_asc',
        field: 'kit_name',
        direction: 'asc',
        label: 'Kit Name (A → Z)',
        subtitle: 'Alphabetical',
      },
      {
        id: 'kit_name_desc',
        field: 'kit_name',
        direction: 'desc',
        label: 'Kit Name (Z → A)',
        subtitle: 'Reverse alphabetical',
      },
      {
        id: 'company_asc',
        field: 'company',
        direction: 'asc',
        label: 'Company (A → Z)',
        subtitle: 'Grouped by brand',
      },
      {
        id: 'artist_asc',
        field: 'artist',
        direction: 'asc',
        label: 'Artist (A → Z)',
        subtitle: 'Grouped by designer',
      },
    ],
  },
  {
    id: 'attribute',
    heading: 'By Attribute',
    options: [
      {
        id: 'status_asc',
        field: 'status',
        direction: 'asc',
        label: 'Status',
        subtitle: 'Wishlist → Completed',
      },
      {
        id: 'width_desc',
        field: 'width',
        direction: 'desc',
        label: 'Width (Largest First)',
        subtitle: 'Biggest kits at the top',
      },
      {
        id: 'width_asc',
        field: 'width',
        direction: 'asc',
        label: 'Width (Smallest First)',
        subtitle: 'Smallest kits at the top',
      },
    ],
  },
];

const ALL_OPTIONS: SortOption[] = SORT_OPTION_GROUPS.flatMap(group => group.options);

const OPTION_BY_FIELD_AND_DIRECTION = new Map<string, SortOption>(
  ALL_OPTIONS.map(option => [`${option.field}:${option.direction}`, option])
);

/**
 * Resolve the current sort (field + direction) to a concrete option.
 *
 * If the pair is not represented in `SORT_OPTION_GROUPS` (e.g. the Table view
 * sorts by column headers like `company:desc`, `artist:desc`, `status:desc`
 * that aren't surfaced in the Sort menu), synthesize a label from the active
 * field and direction instead of silently falling back to "Last Updated". The
 * summary bar needs to tell the truth about what's currently sorted.
 */
export const findSortOption = (
  field: DashboardValidSortField,
  direction: SortDirection
): SortOption => {
  const match = OPTION_BY_FIELD_AND_DIRECTION.get(`${field}:${direction}`);
  if (match) return match;
  const friendlyField = SORT_FIELD_TO_FRIENDLY_NAME[field] ?? field;
  return {
    id: `${field}_${direction}_synthetic`,
    field,
    direction,
    label: `${friendlyField} (${direction === 'asc' ? 'A → Z' : 'Z → A'})`,
    subtitle: '',
  };
};
