// Define DashboardValidSortField here as it's closely tied to the constants
export const DASHBOARD_VALID_SORT_FIELDS = [
  'last_updated',
  'date_purchased',
  'date_finished',
  'date_started',
  'date_received',
  'kit_name',
  'company',
  'artist',
  'status',
  'width',
] as const;

export type DashboardValidSortField = (typeof DASHBOARD_VALID_SORT_FIELDS)[number];

export const MIN_PROJECT_SEARCH_LENGTH = 2;

export const normalizeProjectSearchTerm = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.length >= MIN_PROJECT_SEARCH_LENGTH ? trimmed : '';
};

export const SORT_FIELD_TO_FRIENDLY_NAME: Partial<Record<DashboardValidSortField, string>> = {
  date_purchased: 'Purchase Date',
  date_finished: 'Finished Date',
  date_started: 'Start Date',
  date_received: 'Received Date',
  last_updated: 'Last Updated',
  kit_name: 'Kit Name',
  company: 'Company',
  artist: 'Artist',
  status: 'Status',
  width: 'Width',
};
