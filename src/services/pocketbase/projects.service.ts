/**
 * Modern projects service with structured filters and performance optimizations
 * @author @serabi
 * @created 2025-01-16
 */

import { pb } from '@/lib/pocketbase';
import { normalizeDateOnlyValue, parseDateOnlyAsLocalDate } from '@/utils/date/timezoneUtils';
import { createLogger, batchApiLogger } from '@/utils/logger';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import { isAuthenticated, getCurrentUserId } from '@/services/auth';
import { ProjectsResponse } from '@/types/pocketbase.types';
import { Project, ProjectStatus } from '@/types/project';
import { statusOrderFor } from '@/features/dashboard/status-order';
import type { ProjectDTO } from '@/services/types';
import type {
  CollectionStatsResponse,
  CompletionTimeStatsResponse,
  CompletionsByMonthResponse,
  CompletionsYearlyResponse,
  MonthInReviewResponse,
  StatsSummaryResponse,
} from '@/types/stats';
import { toExpandedProject, toProject, toProjectDTO } from '@/services/pocketbase/projectMappers';
import { expectedRevisionOptions } from '@/services/pocketbase/expectedRevision';
import {
  buildProjectFilter,
  buildProjectQueryConfig,
} from '@/services/pocketbase/projectQueryBuilder';
import {
  ProjectFilters,
  ProjectQueryOptions,
  ProjectQueryResult,
  StatusBreakdown,
  BatchStatusCountResult,
  ProjectServiceConfig,
} from '@/types/projectFilters';

const logger = createLogger('ProjectsService');

// ── Auth helpers (fail-closed ownership pattern) ───────────────────────

function requireCurrentUserId(): string {
  if (!isAuthenticated()) {
    throw ErrorHandler.createError('auth', 'User not authenticated', false);
  }
  const userId = getCurrentUserId();
  if (!userId) {
    throw ErrorHandler.createError('auth', 'User not authenticated', false);
  }
  return userId;
}

function verifyOwnership(record: { user: string }, action: string): void {
  const currentUserId = requireCurrentUserId();
  if (record.user !== currentUserId) {
    throw ErrorHandler.createError(
      'permission',
      `You don't have permission to ${action} this project`,
      false
    );
  }
}

/**
 * Default service configuration
 */
const DEFAULT_CONFIG: ProjectServiceConfig = {
  defaultPageSize: 20,
  defaultSortField: 'last_updated',
  defaultSortDirection: 'desc',
  defaultExpand: {
    tags: true,
    company: false,
    artist: false,
    user: false,
  },
  enablePerformanceLogging: import.meta.env.DEV,
};

const DASHBOARD_PROJECT_FIELDS = [
  'id',
  'user',
  'title',
  'title_sort',
  'company',
  'company_name_sort',
  'company_sort_order',
  'artist',
  'artist_name_sort',
  'artist_sort_order',
  'status',
  'status_order',
  'kit_category',
  'drill_shape',
  'date_purchased',
  'date_purchased_has_value',
  'date_received',
  'date_received_has_value',
  'date_started',
  'date_started_has_value',
  'date_completed',
  'date_completed_has_value',
  'width',
  'width_has_value',
  'height',
  'total_diamonds',
  'color_count',
  'general_notes',
  'image',
  'source_url',
  'created',
  'updated',
].join(',');

const VALID_PROJECT_STATUSES: readonly ProjectStatus[] = [
  'wishlist',
  'purchased',
  'stash',
  'kitted',
  'progress',
  'onhold',
  'completed',
  'archived',
  'destashed',
];

const isProjectStatus = (v: unknown): v is ProjectStatus =>
  typeof v === 'string' && (VALID_PROJECT_STATUSES as readonly string[]).includes(v);

/**
 * Augment a create/update payload with `status_order` derived from `status`.
 * Handles both FormData (mutated in place) and plain-object (returned spread).
 * No-op when `status` is absent from the payload, partial updates stay partial.
 */
function withStatusOrder<T extends FormData | Record<string, unknown>>(data: T): T {
  if (data instanceof FormData) {
    const status = data.get('status');
    if (isProjectStatus(status)) {
      data.set('status_order', String(statusOrderFor(status)));
    }
    return data;
  }
  const status = (data as Record<string, unknown>).status;
  if (isProjectStatus(status)) {
    return { ...data, status_order: statusOrderFor(status) } as T;
  }
  return data;
}

/**
 * projects service with structured filters and optimized queries
 */
export class ProjectsService {
  private config: ProjectServiceConfig;

  constructor(config: Partial<ProjectServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get projects with optimized query patterns
   */
  async getProjects(
    options: ProjectQueryOptions,
    companyMap?: Map<string, string>,
    artistMap?: Map<string, string>
  ): Promise<ProjectQueryResult> {
    const startTime = this.config.enablePerformanceLogging ? performance.now() : 0;

    try {
      const { filter, sort, expand } = buildProjectQueryConfig(options.filters, {
        sort: options.sort,
        expand: options.expand,
      });
      const { page, pageSize } = options;
      const fields = DASHBOARD_PROJECT_FIELDS;

      // Enhanced dev logging for Dashboard performance monitoring
      if (import.meta.env.DEV) {
        logger.info('🚀 [DASHBOARD] ProjectsService: Starting project query', {
          filter,
          sort,
          expand,
          page,
          pageSize,
          status: options.filters.status,
          includeStatusCounts: options.includeStatusCounts,
        });
      }

      const queryStartTime = performance.now();

      // Keep the skipped-total path for valid pages. An empty later page needs
      // an exact bound so a shared URL can return to the last real page.
      const result = await ErrorHandler.handleAsync(async () => {
        const isDeepSearch = options.filters.searchAllFields === true;
        const isAnySearchOnFirstPage = Boolean(
          options.filters.searchTerm && options.filters.searchTerm.trim() && page === 1
        );
        const queryOptions = {
          filter,
          sort,
          expand,
          fields,
          skipTotal: isDeepSearch || isAnySearchOnFirstPage,
        };
        const pageResult = await pb.collection('projects').getList(page, pageSize, queryOptions);

        if (page > 1 && pageResult.totalItems === -1 && pageResult.items.length === 0) {
          return pb.collection('projects').getList(page, pageSize, {
            ...queryOptions,
            skipTotal: false,
          });
        }

        return pageResult;
      }, 'Project query');

      const queryEndTime = performance.now();
      const queryDuration = queryEndTime - queryStartTime;

      const projects = result.items.map((record: ProjectsResponse) =>
        toProject(record, companyMap, artistMap)
      );

      // PocketBase returns totalItems === -1 when skipTotal is set (see above).
      // Derive a displayable count from items.length. If the page is full we
      // don't know the true total, so we expose that uncertainty via
      // totalItemsIsEstimate and let the UI render a "+" suffix.
      const rawTotal = result.totalItems;
      const pageIsFull = result.items.length === pageSize;
      const totalItems = rawTotal === -1 ? result.items.length : rawTotal;
      const totalItemsIsEstimate = rawTotal === -1 && pageIsFull;
      const totalPages = rawTotal === -1 ? (pageIsFull ? page + 1 : page) : result.totalPages;

      // Get status counts if requested
      let statusCounts: StatusBreakdown | undefined;
      let statusCountDuration = 0;
      if (options.includeStatusCounts) {
        const statusStartTime = performance.now();
        const statusResult = await this.getBatchStatusCounts(options.filters);
        statusCounts = statusResult.counts;
        statusCountDuration = performance.now() - statusStartTime;
      }

      if (this.config.enablePerformanceLogging) {
        const endTime = performance.now();
        const totalDuration = endTime - startTime;

        // Enhanced dev logging for Dashboard performance monitoring
        if (import.meta.env.DEV) {
          logger.info('✅ [DASHBOARD] ProjectsService: Query completed', {
            totalDuration: `${Math.round(totalDuration)}ms`,
            queryDuration: `${Math.round(queryDuration)}ms`,
            statusCountDuration: `${Math.round(statusCountDuration)}ms`,
            itemsReturned: projects.length,
            totalItems,
            totalItemsIsEstimate,
            totalPages,
            hasStatusCounts: !!statusCounts,
            performanceBreakdown: {
              query: `${Math.round(queryDuration)}ms`,
              statusCounts: statusCounts ? `${Math.round(statusCountDuration)}ms` : 'skipped',
              transformation: `${Math.round(totalDuration - queryDuration - statusCountDuration)}ms`,
            },
          });
        } else {
          logger.debug(`Query completed in ${Math.round(totalDuration)}ms`, {
            itemsReturned: projects.length,
            totalItems,
            totalItemsIsEstimate,
          });
        }
      }

      return {
        projects,
        totalItems,
        totalItemsIsEstimate,
        totalPages,
        currentPage: page,
        pageSize,
        statusCounts,
      };
    } catch (error) {
      logger.error('Failed to fetch projects', error);
      throw ErrorHandler.handleError(error, 'Project query');
    }
  }

  /**
   * Get batch status counts using single optimized query approach
   * Uses getList with page size instead of getFullList for better performance control
   * Avoids parallel queries that proved slower due to network overhead
   * Note: This method is designed to work with moderate caching (30 seconds - 2 minutes)
   */
  async getBatchStatusCounts(
    baseFilters: ProjectFilters,
    options?: { skipStatusExclusionCheckboxes?: boolean }
  ): Promise<BatchStatusCountResult> {
    const startTime = this.config.enablePerformanceLogging ? performance.now() : 0;
    const batchId = batchApiLogger.startBatchOperation(
      'status-counts-single-optimized',
      1,
      'Single optimized getList query for status counting'
    );

    try {
      logger.debug('🔍 Starting single optimized status count query');

      // Build base filter excluding status (we'll get all statuses in one query)
      const baseFilter = buildProjectFilter(baseFilters, {
        skipStatusExclusionCheckboxes: options?.skipStatusExclusionCheckboxes === true,
      });
      logger.debug('📋 Generated base filter:', {
        filterString: baseFilter,
        originalFilters: baseFilters,
        filterLength: baseFilter.length,
      });

      // Use getFullList to ensure we count ALL matching projects regardless of dataset size
      logger.debug('🚀 Executing getFullList query for status counting...');
      const queryStartTime = performance.now();

      const items = await pb.collection('projects').getFullList({
        filter: baseFilter,
        fields: 'status', // Only fetch status field for minimal data transfer
        sort: '', // No sorting needed for counting
        batch: 500, // Fetch in batches of 500 for efficiency
      });

      const queryEndTime = performance.now();
      const queryDuration = queryEndTime - queryStartTime;

      // Fast in-memory counting (should be <10ms for 672 projects)
      const countingStartTime = performance.now();
      const counts: StatusBreakdown = {
        wishlist: 0,
        purchased: 0,
        stash: 0,
        kitted: 0,
        progress: 0,
        onhold: 0,
        completed: 0,
        archived: 0,
        destashed: 0,
      };

      let unrecognizedStatuses = 0;
      const total = items.length;

      items.forEach((project: { status: string }) => {
        const status = project.status as keyof StatusBreakdown;
        if (status && Object.prototype.hasOwnProperty.call(counts, status)) {
          counts[status]++;
        } else {
          unrecognizedStatuses++;
          logger.warn('Unrecognized project status:', status);
        }
      });

      const countingDuration = performance.now() - countingStartTime;

      logger.info('✅ Status counting completed', {
        queryDuration: `${Math.round(queryDuration)}ms`,
        countingDuration: `${Math.round(countingDuration)}ms`,
        totalDuration: `${Math.round(queryDuration + countingDuration)}ms`,
        totalProjects: total,
        statusBreakdown: counts,
        optimization: 'getFullList + in-memory counting',
        performanceRating:
          queryDuration < 200 ? 'excellent' : queryDuration < 500 ? 'good' : 'needs-optimization',
      });

      if (this.config.enablePerformanceLogging) {
        const endTime = performance.now();
        batchApiLogger.endBatchOperation(batchId, total, {
          totalCounts: total,
          statusBreakdown: counts,
          queryType: 'getFullList_optimized',
          projectsProcessed: total,
          unrecognizedStatuses,
          queryDuration: Math.round(queryDuration),
          countingDuration: Math.round(countingDuration),
        });
        logger.debug(`✅ Status counts completed in ${Math.round(endTime - startTime)}ms`, {
          totalCounts: total,
          statusBreakdown: counts,
          projectsProcessed: total,
          unrecognizedStatuses,
        });
      }

      logger.debug('🎯 Returning optimized status count results:', { counts, total });
      return { counts, total };
    } catch (error) {
      logger.error('❌ Failed to fetch optimized status counts', {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        filters: baseFilters,
      });

      throw ErrorHandler.handleError(error, 'Status count query');
    }
  }

  // ── Simple CRUD methods ──────────────────────────────────────────────

  /** Get a single project by ID */
  async getOne(
    projectId: string,
    options?: { expand?: string; fields?: string }
  ): Promise<ProjectDTO> {
    return ErrorHandler.handleAsync(async () => {
      const record = await pb.collection('projects').getOne(projectId, options);
      return toProjectDTO(record);
    }, 'Projects.getOne');
  }

  /**
   * Get a single project with all relationships resolved into a domain Project.
   * Handles expand failures gracefully with individual fallback queries.
   */
  async getProjectDetail(projectId: string): Promise<Project> {
    return ErrorHandler.handleAsync(async () => {
      let record: ProjectsResponse;

      try {
        record = await pb.collection('projects').getOne(projectId, {
          expand: 'company,artist,project_tags_via_project.tag',
        });
      } catch {
        // If full expand fails, fetch basic record and try individual expands
        record = await pb.collection('projects').getOne(projectId);
        const mergedExpand: Record<string, unknown> = {};

        if (record.company) {
          try {
            const r = await pb.collection('projects').getOne(projectId, { expand: 'company' });
            Object.assign(mergedExpand, (r.expand as Record<string, unknown>) || {});
          } catch {
            /* skip */
          }
        }
        if (record.artist) {
          try {
            const r = await pb.collection('projects').getOne(projectId, { expand: 'artist' });
            Object.assign(mergedExpand, (r.expand as Record<string, unknown>) || {});
          } catch {
            /* skip */
          }
        }
        try {
          const r = await pb.collection('projects').getOne(projectId, {
            expand: 'project_tags_via_project.tag',
          });
          Object.assign(mergedExpand, (r.expand as Record<string, unknown>) || {});
        } catch {
          /* skip */
        }

        (record as Record<string, unknown>).expand = mergedExpand;
      }

      return toExpandedProject(record);
    }, 'Projects.getProjectDetail');
  }

  /** Create a project (accepts FormData for image uploads) */
  async create(data: FormData | Record<string, unknown>): Promise<ProjectDTO> {
    return ErrorHandler.handleAsync(async () => {
      const record = await pb.collection('projects').create(withStatusOrder(data));
      return toProjectDTO(record);
    }, 'Projects.create');
  }

  /** Update a project (accepts FormData for image uploads). Verifies ownership (fail-closed). */
  async update(
    projectId: string,
    data: FormData | Record<string, unknown>,
    expectedRevision?: number
  ): Promise<ProjectDTO> {
    return ErrorHandler.handleAsync(async () => {
      const existing = await pb.collection('projects').getOne(projectId, { fields: 'id,user' });
      verifyOwnership(existing, 'update');
      const payload = withStatusOrder(data);
      const record =
        expectedRevision === undefined
          ? await pb.collection('projects').update(projectId, payload)
          : await pb
              .collection('projects')
              .update(projectId, payload, expectedRevisionOptions(expectedRevision));
      return toProjectDTO(record);
    }, 'Projects.update');
  }

  /** Build a partial update from one current, ownership-checked record. */
  async updateWithCurrent(
    projectId: string,
    fields: string[],
    buildData: (current: ProjectDTO) => Promise<FormData | Record<string, unknown>>
  ): Promise<ProjectDTO> {
    const existing = await ErrorHandler.handleAsync(
      () =>
        pb.collection('projects').getOne(projectId, {
          fields: ['id', 'user', ...fields].join(','),
        }),
      'Projects.updateWithCurrent'
    );
    verifyOwnership(existing, 'update');
    const data = await buildData(toProjectDTO(existing));
    const record = await ErrorHandler.handleAsync(
      () => pb.collection('projects').update(projectId, withStatusOrder(data)),
      'Projects.updateWithCurrent'
    );
    return toProjectDTO(record);
  }

  /** Delete a project by ID. Verifies ownership (fail-closed). */
  async deleteProject(projectId: string): Promise<void> {
    return ErrorHandler.handleAsync(async () => {
      const existing = await pb.collection('projects').getOne(projectId, { fields: 'id,user' });
      verifyOwnership(existing, 'delete');
      await pb.collection('projects').delete(projectId);
    }, 'Projects.delete');
  }

  /** Get distinct years with completed projects for a user */
  /**
   * Count projects whose has_value sentinel for a given date/width field is 1;
   * i.e. projects missing that value. Respects the user's active filters so
   * the count matches what the user would see if they paginated through every
   * page of the current filtered view.
   *
   * `sentinelField` must be one of the `*_has_value` columns from migration
   * 1777100000_add_sort_proxy_columns_to_projects.js.
   */
  async getUndatedCount(
    filters: ProjectFilters,
    sentinelField:
      | 'date_purchased_has_value'
      | 'date_received_has_value'
      | 'date_started_has_value'
      | 'date_completed_has_value'
      | 'width_has_value'
  ): Promise<number> {
    return ErrorHandler.handleAsync(async () => {
      const baseFilter = buildProjectFilter(filters);
      const sentinelClause = `${sentinelField} = 1`;
      const combined = baseFilter ? `(${baseFilter}) && ${sentinelClause}` : sentinelClause;
      const result = await pb.collection('projects').getList(1, 1, {
        filter: combined,
        fields: 'id',
      });
      return result.totalItems;
    }, 'Projects.getUndatedCount');
  }

  async getAvailableYears(userId: string): Promise<number[]> {
    return ErrorHandler.handleAsync(async () => {
      const records = await pb.collection('projects').getFullList({
        filter: pb.filter('user = {:userId} && date_completed != ""', { userId }),
        fields: 'date_completed',
      });

      const years = new Set<number>();
      for (const record of records) {
        const dateOnly = normalizeDateOnlyValue(record.date_completed);
        if (parseDateOnlyAsLocalDate(dateOnly)) {
          years.add(Number(dateOnly.slice(0, 4)));
        }
      }
      return Array.from(years).sort((a, b) => b - a);
    }, 'Projects.getAvailableYears');
  }

  async getStatsSummary(year?: number): Promise<StatsSummaryResponse> {
    return ErrorHandler.handleAsync(async () => {
      return pb.send('/api/stats/summary', {
        method: 'GET',
        query: year ? { year } : undefined,
      });
    }, 'Projects.getStatsSummary');
  }

  async getCompletionsByMonth(year: number): Promise<CompletionsByMonthResponse> {
    return ErrorHandler.handleAsync(async () => {
      return pb.send('/api/stats/completions', {
        method: 'GET',
        query: { year },
      });
    }, 'Projects.getCompletionsByMonth');
  }

  async getCompletionsYearly(): Promise<CompletionsYearlyResponse> {
    return ErrorHandler.handleAsync(async () => {
      return pb.send('/api/stats/completions/yearly', {
        method: 'GET',
      });
    }, 'Projects.getCompletionsYearly');
  }

  async getCompletionTimeStats(): Promise<CompletionTimeStatsResponse> {
    return ErrorHandler.handleAsync(async () => {
      return pb.send('/api/stats/completion-times', {
        method: 'GET',
      });
    }, 'Projects.getCompletionTimeStats');
  }

  async getCollectionStats(): Promise<CollectionStatsResponse> {
    return ErrorHandler.handleAsync(async () => {
      return pb.send('/api/stats/collection', {
        method: 'GET',
      });
    }, 'Projects.getCollectionStats');
  }

  async getMonthInReview(year: number, month: number): Promise<MonthInReviewResponse> {
    return ErrorHandler.handleAsync(async () => {
      return pb.send('/api/stats/month-in-review', {
        method: 'GET',
        query: { year, month },
      });
    }, 'Projects.getMonthInReview');
  }

  /** Get in-progress projects for a user, with company/artist names resolved */
  async getInProgress(userId: string): Promise<Project[]> {
    return ErrorHandler.handleAsync(async () => {
      const records = await pb.collection('projects').getFullList<ProjectsResponse>({
        filter: pb.filter('user = {:userId} && status = {:status}', { userId, status: 'progress' }),
        fields:
          'id,user,title,image,updated,created,status,company,artist,expand.company.name,expand.artist.name',
        sort: '-updated',
        expand: 'company,artist',
        requestKey: null,
      });
      return records.map(r => toExpandedProject(r));
    }, 'Projects.getInProgress');
  }

  /** Get all projects for a user (for export), with all relationships resolved */
  async getAllForUser(userId: string): Promise<Project[]> {
    return ErrorHandler.handleAsync(async () => {
      const records = await pb.collection('projects').getFullList<ProjectsResponse>({
        filter: pb.filter('user = {:userId}', { userId }),
        sort: '-updated',
        expand: 'company,artist,project_tags_via_project.tag',
      });
      return records.map(r => toExpandedProject(r));
    }, 'Projects.getAllForUser');
  }
  /** Check if a project has related records in another collection */
  async hasRelatedRecords(projectId: string, collection: string): Promise<boolean> {
    return ErrorHandler.handleAsync(async () => {
      const result = await pb.collection(collection).getList(1, 1, {
        filter: pb.filter('project = {:projectId}', { projectId }),
      });
      return result.totalItems > 0;
    }, 'Projects.hasRelatedRecords');
  }

  /** Delete all project_tags for a project */
  async deleteProjectTags(projectId: string): Promise<void> {
    return ErrorHandler.handleAsync(async () => {
      const tags = await pb.collection('project_tags').getFullList({
        filter: pb.filter('project = {:projectId}', { projectId }),
        fields: 'id',
      });
      await Promise.all(tags.map(t => pb.collection('project_tags').delete(t.id)));
    }, 'Projects.deleteProjectTags');
  }
}

// Create and export default service instance
export const projectsService = new ProjectsService();
