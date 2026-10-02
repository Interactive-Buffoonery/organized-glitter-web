/**
 * @fileoverview React Query key definitions for consistent caching
 *
 * This file defines hierarchical query keys used throughout the application
 * for React Query cache management. Keys follow a consistent pattern:
 * [resource, type, identifier, params]
 *
 * Key principles:
 * - Hierarchical structure enables targeted cache invalidation
 * - Consistent naming prevents cache key collisions
 * - TypeScript const assertions ensure type safety
 * - Parameters are included for cache isolation
 *
 * @author serabi
 * @since 2025-07-02
 */

import type { ProjectFilterCriteria } from '@/types/projectFilters';
import { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';

/**
 * Creates a secure hash of user ID for query keys
 * Prevents user IDs from being exposed in cache logs while maintaining uniqueness
 */
const createUserKeyHash = (userId: string): string => {
  if (!userId || userId === 'guest') return 'guest';

  // Simple hash function for query key safety
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `u_${Math.abs(hash).toString(36)}`;
};

type QueryKeyValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | QueryKeyValue[]
  | { [key: string]: QueryKeyValue };

const normalizeQueryKeyValue = (value: unknown): QueryKeyValue => {
  if (Array.isArray(value)) {
    return value
      .map(normalizeQueryKeyValue)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object' && value !== null) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, QueryKeyValue>>((normalized, key) => {
        normalized[key] = normalizeQueryKeyValue((value as Record<string, unknown>)[key]);
        return normalized;
      }, {});
  }

  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  return String(value);
};

const createStableKey = (value: unknown): string => JSON.stringify(normalizeQueryKeyValue(value));

const createStableIdListKey = (ids: string[]): string => createStableKey(ids);

/**
 * Parameters for project list queries
 * Used to create unique cache keys for different filter/sort combinations
 */
export interface ProjectQueryParams {
  filters: ProjectFilterCriteria;
  sortField: DashboardValidSortField;
  sortDirection: 'asc' | 'desc';
  currentPage: number;
  pageSize: number;
  [key: string]: unknown;
}

/**
 * Parameters for dashboard status-count queries.
 * These intentionally exclude status, sort, pagination, and view concerns so
 * the counts remain stable while the user browses within the current slice.
 */
export interface DashboardStatusCountsParams {
  filters: Omit<ProjectFilterCriteria, 'status' | 'includeArchived' | 'includeDestashed'>;
}

export type ProjectUndatedSentinelField =
  | 'date_purchased_has_value'
  | 'date_received_has_value'
  | 'date_started_has_value'
  | 'date_completed_has_value'
  | 'width_has_value';

export interface ProjectUndatedCountParams {
  sentinelField: ProjectUndatedSentinelField | null;
  filters: ProjectFilterCriteria;
}

export type NotesFeedCraftFilter = 'all' | 'diamond' | 'coloring';

export interface NotesFeedQueryParams {
  craft?: NotesFeedCraftFilter;
  sourceId?: string;
  projectId?: string;
  year?: number;
  hasImage?: boolean;
}

export interface NoteTargetsQueryParams {
  searchTerm?: string;
  diamondEnabled?: boolean;
  coloringEnabled?: boolean;
}

/**
 * Parameters for company list queries
 * Used to create unique cache keys for different pagination combinations
 */
export interface CompanyQueryParams {
  currentPage: number;
  pageSize: number;
}

export interface ColoringBooksQueryParams {
  userId?: string;
  page?: number;
  perPage?: number;
  filter?: string;
  sort?: string;
  expand?: string;
}

export interface ColoringPagesQueryParams {
  bookId?: string;
  filter?: string;
  sort?: string;
  expand?: string;
  page?: number;
  perPage?: number;
}

/**
 * Hierarchical query key definitions for React Query cache management
 *
 * Structure follows the pattern: [resource, type, identifier, params]
 * This enables targeted cache invalidation and prevents key collisions.
 *
 * @example
 * // Invalidate all project queries
 * queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
 *
 * // Invalidate specific project list
 * queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(userId, params) });
 */
export const queryKeys = {
  // Project-related keys
  projects: {
    /** Base key for all project queries */
    all: ['projects'] as const,
    /** Base key for project list queries */
    lists: () => [...queryKeys.projects.all, 'list'] as const,
    /** Specific project list with user and parameters - uses stable serialization */
    list: (userId: string, params: ProjectQueryParams) =>
      [...queryKeys.projects.lists(), createUserKeyHash(userId), createStableKey(params)] as const,
    /** Dashboard status counts scoped to the current non-status filter slice */
    statusCounts: (userId: string, params: DashboardStatusCountsParams) =>
      [
        ...queryKeys.projects.lists(),
        'status-counts',
        createUserKeyHash(userId),
        createStableKey(params as unknown as Record<string, unknown>),
      ] as const,
    /** Count projects missing the current sort field's sentinel value */
    undatedCount: (userId: string, params: ProjectUndatedCountParams) =>
      [
        ...queryKeys.projects.lists(),
        'undated-count',
        createUserKeyHash(userId),
        createStableKey(params as unknown as Record<string, unknown>),
      ] as const,
    /** Base key for project detail queries */
    details: () => [...queryKeys.projects.all, 'detail'] as const,
    /** Specific project detail by ID */
    detail: (id: string) => [...queryKeys.projects.details(), id] as const,
  },

  // Company-related keys
  companies: {
    all: ['companies'] as const,
    lists: () => [...queryKeys.companies.all, 'list'] as const,
    list: (userId: string, params: CompanyQueryParams) =>
      [...queryKeys.companies.lists(), createUserKeyHash(userId), params] as const,
    allForUser: (userId: string) =>
      [...queryKeys.companies.all, 'all-for-user', createUserKeyHash(userId)] as const,
    details: () => [...queryKeys.companies.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.companies.details(), id] as const,
  },

  // Artist-related keys
  artists: {
    all: ['artists'] as const,
    lists: () => [...queryKeys.artists.all, 'list'] as const,
    list: (userId: string) => [...queryKeys.artists.lists(), createUserKeyHash(userId)] as const,
    details: () => [...queryKeys.artists.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.artists.details(), id] as const,
  },

  // Tag-related keys
  tags: {
    all: ['tags'] as const,
    lists: () => [...queryKeys.tags.all, 'list'] as const,
    list: (userId: string) => [...queryKeys.tags.lists(), createUserKeyHash(userId)] as const,
    details: () => [...queryKeys.tags.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.tags.details(), id] as const,
    stats: () => [...queryKeys.tags.all, 'stats'] as const,
    stat: (userId: string, tagIds: string[]) =>
      [
        ...queryKeys.tags.stats(),
        createUserKeyHash(userId),
        createStableIdListKey(tagIds),
      ] as const,
  },

  // Progress notes-related keys
  progressNotes: {
    all: ['progressNotes'] as const,
    lists: () => [...queryKeys.progressNotes.all, 'list'] as const,
    list: (projectId: string) => [...queryKeys.progressNotes.lists(), projectId] as const,
  },

  // Cross-craft notes feed keys
  notesFeed: {
    all: ['notesFeed'] as const,
    lists: () => [...queryKeys.notesFeed.all, 'list'] as const,
    list: (userId: string, params: NotesFeedQueryParams = {}) =>
      [
        ...queryKeys.notesFeed.lists(),
        createUserKeyHash(userId),
        createStableKey({
          craft: params.craft ?? 'all',
          sourceId: params.sourceId ?? null,
          projectId: params.projectId ?? null,
          year: params.year ?? null,
          hasImage: params.hasImage ?? null,
        }),
      ] as const,
  },

  // Add-note target picker keys
  noteTargets: {
    all: ['noteTargets'] as const,
    lists: () => [...queryKeys.noteTargets.all, 'list'] as const,
    list: (userId: string, params: NoteTargetsQueryParams = {}) =>
      [
        ...queryKeys.noteTargets.lists(),
        createUserKeyHash(userId),
        createStableKey({
          searchTerm: params.searchTerm?.trim() || null,
          diamondEnabled: params.diamondEnabled ?? true,
          coloringEnabled: params.coloringEnabled ?? true,
        }),
      ] as const,
    pagesForBook: (userId: string, bookId: string) =>
      [...queryKeys.noteTargets.all, 'pages-for-book', createUserKeyHash(userId), bookId] as const,
  },

  // User-related keys
  user: {
    all: ['user'] as const,
    profile: (userId: string) =>
      [...queryKeys.user.all, 'profile', createUserKeyHash(userId)] as const,
    betaTesterStatus: (userId: string) =>
      [...queryKeys.user.all, 'beta-tester', createUserKeyHash(userId)] as const,
    optimisticAvatar: (userId: string) =>
      [...queryKeys.user.all, 'optimistic-avatar', createUserKeyHash(userId)] as const,
    dashboardNavigationContext: (userId: string) =>
      [...queryKeys.user.all, 'dashboard-navigation-context', createUserKeyHash(userId)] as const,
  },

  // Coloring-related keys
  coloring: {
    colorReferences: {
      all: ['color-references'] as const,
      detail: (userId: string, pageId: string) =>
        [...queryKeys.coloring.colorReferences.all, createUserKeyHash(userId), pageId] as const,
      images: (userId: string, pageId: string, revision: string) =>
        [...queryKeys.coloring.colorReferences.detail(userId, pageId), 'images', revision] as const,
    },
    books: {
      all: ['coloring-books'] as const,
      lists: () => [...queryKeys.coloring.books.all, 'list'] as const,
      list: (filters: ColoringBooksQueryParams) =>
        [...queryKeys.coloring.books.lists(), createStableKey(filters)] as const,
      details: () => [...queryKeys.coloring.books.all, 'detail'] as const,
      detail: (id: string) => [...queryKeys.coloring.books.details(), id] as const,
    },
    pages: {
      all: ['coloring-pages'] as const,
      lists: () => [...queryKeys.coloring.pages.all, 'list'] as const,
      list: (filters: ColoringPagesQueryParams) =>
        [...queryKeys.coloring.pages.lists(), createStableKey(filters)] as const,
      details: () => [...queryKeys.coloring.pages.all, 'detail'] as const,
      detail: (pageId: string) => [...queryKeys.coloring.pages.details(), pageId] as const,
    },
    pageProgressNotes: {
      all: ['coloring-page-progress-notes'] as const,
      lists: () => [...queryKeys.coloring.pageProgressNotes.all, 'list'] as const,
      list: (pageId: string) => [...queryKeys.coloring.pageProgressNotes.lists(), pageId] as const,
    },
    publishers: {
      all: ['book-publishers'] as const,
      list: (userId?: string) =>
        userId
          ? ([...queryKeys.coloring.publishers.all, createUserKeyHash(userId)] as const)
          : queryKeys.coloring.publishers.all,
    },
    illustrators: {
      all: ['book-illustrators'] as const,
      list: (userId?: string) =>
        userId
          ? ([...queryKeys.coloring.illustrators.all, createUserKeyHash(userId)] as const)
          : queryKeys.coloring.illustrators.all,
    },
    mediums: {
      all: ['coloring-mediums'] as const,
      list: (userId?: string) =>
        userId
          ? ([...queryKeys.coloring.mediums.all, createUserKeyHash(userId)] as const)
          : queryKeys.coloring.mediums.all,
    },
    tags: {
      all: ['coloring-tags'] as const,
      lists: () => [...queryKeys.coloring.tags.all, 'list'] as const,
      list: (userId?: string) =>
        userId
          ? ([...queryKeys.coloring.tags.lists(), createUserKeyHash(userId)] as const)
          : queryKeys.coloring.tags.lists(),
      book: (bookId: string) => [...queryKeys.coloring.tags.all, 'book', bookId] as const,
      stats: () => [...queryKeys.coloring.tags.all, 'stats'] as const,
      stat: (userId: string, tagIds: string[]) =>
        [
          ...queryKeys.coloring.tags.stats(),
          createUserKeyHash(userId),
          createStableIdListKey(tagIds),
        ] as const,
    },
  },

  // Dashboard settings keys (per-user JSON preferences in user_dashboard_settings)
  dashboardSettings: {
    all: ['dashboardSettings'] as const,
    verticals: (userId: string) =>
      [...queryKeys.dashboardSettings.all, 'verticals', createUserKeyHash(userId)] as const,
    coloringNavigationContext: (userId: string) =>
      [
        ...queryKeys.dashboardSettings.all,
        'coloringNavigationContext',
        createUserKeyHash(userId),
      ] as const,
    randomizerNextUp: (userId: string) =>
      [...queryKeys.dashboardSettings.all, 'randomizerNextUp', createUserKeyHash(userId)] as const,
  },

  // Stats and analytics keys
  stats: {
    all: ['stats'] as const,
    overview: (userId: string) =>
      [...queryKeys.stats.all, 'overview', createUserKeyHash(userId)] as const,
    availableYears: (userId: string) =>
      [...queryKeys.stats.all, 'availableYears', createUserKeyHash(userId)] as const,
    summary: (userId: string, year: number) =>
      [...queryKeys.stats.all, 'summary', createUserKeyHash(userId), year] as const,
    completionsByMonth: (userId: string, year: number) =>
      [...queryKeys.stats.all, 'completionsByMonth', createUserKeyHash(userId), year] as const,
    completionsYearly: (userId: string) =>
      [...queryKeys.stats.all, 'completionsYearly', createUserKeyHash(userId)] as const,
    completionTimes: (userId: string) =>
      [...queryKeys.stats.all, 'completionTimes', createUserKeyHash(userId)] as const,
    collection: (userId: string) =>
      [...queryKeys.stats.all, 'collection', createUserKeyHash(userId)] as const,
    coloringSummary: (userId: string, year: number) =>
      [...queryKeys.stats.all, 'coloringSummary', createUserKeyHash(userId), year] as const,
    coloringCompletionsByMonth: (userId: string, year: number) =>
      [
        ...queryKeys.stats.all,
        'coloringCompletionsByMonth',
        createUserKeyHash(userId),
        year,
      ] as const,
    coloringCompletionsYearly: (userId: string) =>
      [...queryKeys.stats.all, 'coloringCompletionsYearly', createUserKeyHash(userId)] as const,
    coloringCompletionTimes: (userId: string) =>
      [...queryKeys.stats.all, 'coloringCompletionTimes', createUserKeyHash(userId)] as const,
    coloringCollection: (userId: string) =>
      [...queryKeys.stats.all, 'coloringCollection', createUserKeyHash(userId)] as const,
  },
} as const;
