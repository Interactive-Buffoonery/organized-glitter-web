/**
 * Type-safe project filter interfaces for structured query building
 * @author @serabi
 * @created 2025-07-16
 */

import { Project } from './project';
import { ProjectFilterStatus } from './project-status';
import { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';

/**
 * Main project filter interface - replaces manual filter string building
 */
export interface ProjectFilters {
  /** Filter by project status */
  status?: ProjectFilterStatus;
  /** Filter by company ID */
  company?: string;
  /** Filter by artist ID */
  artist?: string;
  /** Filter by drill shape */
  drillShape?: string;
  /** Filter by year finished */
  yearFinished?: string;
  /** Include mini kits in results */
  includeMiniKits?: boolean;
  /** Include destashed projects */
  includeDestashed?: boolean;
  /** Include archived projects */
  includeArchived?: boolean;
  /** Search term for title and notes */
  searchTerm?: string;
  /** When true, perform broader contains search across multiple fields (slower) */
  searchAllFields?: boolean;
  /** Selected tag IDs */
  selectedTags?: string[];
  /** User ID for data isolation */
  userId: string;
}

/**
 * Filter criteria minus userId. Used for query keys, where userId is keyed
 * separately and should not be duplicated inside the filter payload.
 */
export type ProjectFilterCriteria = Omit<ProjectFilters, 'userId'>;

/**
 * Project sort configuration
 */
export interface ProjectSort {
  /** Sort field */
  field: DashboardValidSortField;
  /** Sort direction */
  direction: 'asc' | 'desc';
}

/**
 * Project query options for service layer
 */
export interface ProjectQueryOptions {
  /** Filter criteria */
  filters: ProjectFilters;
  /** Sort configuration */
  sort: ProjectSort;
  /** Page number (1-based) */
  page: number;
  /** Number of items per page */
  pageSize: number;
  /** Whether to expand related data */
  expand?: ProjectExpandOptions;
  /** Whether to include status counts */
  includeStatusCounts?: boolean;
}

/**
 * Expand options for related data
 */
export interface ProjectExpandOptions {
  /** Include project tags */
  tags?: boolean;
  /** Include company data */
  company?: boolean;
  /** Include artist data */
  artist?: boolean;
  /** Include user data */
  user?: boolean;
}

/**
 * Project query result with metadata
 */
export interface ProjectQueryResult {
  /** Project records */
  projects: Project[];
  /** Total number of items. When totalItemsIsEstimate is true this is a lower bound (items.length) because PocketBase's skipTotal optimization suppressed the count query. */
  totalItems: number;
  /** True when totalItems was derived from items.length because PocketBase returned -1 under skipTotal and the page was full. UI should display a "+" suffix. */
  totalItemsIsEstimate: boolean;
  /** Total number of pages */
  totalPages: number;
  /** Current page */
  currentPage: number;
  /** Items per page */
  pageSize: number;
  /** Status breakdown counts */
  statusCounts?: StatusBreakdown;
}

/**
 * Status breakdown for dashboard counters
 */
export interface StatusBreakdown {
  wishlist: number;
  purchased: number;
  stash: number;
  kitted: number;
  progress: number;
  onhold: number;
  completed: number;
  archived: number;
  destashed: number;
}

/**
 * Batch status count result
 */
export interface BatchStatusCountResult {
  /** Status counts */
  counts: StatusBreakdown;
  /** Total across all statuses */
  total: number;
  /** Query execution duration in milliseconds */
  queryDuration?: number;
  /** Optimization method used */
  optimization?: string;
}

/**
 * Project service configuration
 */
export interface ProjectServiceConfig {
  /** Default page size */
  defaultPageSize: number;
  /** Default sort field */
  defaultSortField: DashboardValidSortField;
  /** Default sort direction */
  defaultSortDirection: 'asc' | 'desc';
  /** Default expand options */
  defaultExpand: ProjectExpandOptions;
  /** Enable performance logging */
  enablePerformanceLogging: boolean;
}
