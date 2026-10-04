import { useEffect } from 'react';
import type { FilterState } from '@/contexts/FilterContext';
import type { ProjectFilterCriteria } from '@/types/projectFilters';
import { createLogger, dashboardLogger } from '@/utils/logger';
import { useRenderGuard, useThrottledLogger } from '@/utils/query/renderGuards';
import type { ProjectsResult } from './queries/useProjects';

const logger = createLogger('useDashboardData');

type DashboardProjectsQuery = {
  data: ProjectsResult | undefined;
  isLoading: boolean;
  isStale: boolean;
};

type UseDashboardTelemetryInput = {
  userId: string | undefined;
  filters: FilterState;
  filterCriteria: ProjectFilterCriteria;
  companiesSignature: string;
  artistsSignature: string;
  selectedTagsSignature: string;
  companiesCount: number;
  artistsCount: number;
  projectsQuery: DashboardProjectsQuery;
};

export const useDashboardTelemetry = ({
  userId,
  filters,
  filterCriteria,
  companiesSignature,
  artistsSignature,
  selectedTagsSignature,
  companiesCount,
  artistsCount,
  projectsQuery,
}: UseDashboardTelemetryInput) => {
  const { getRenderStats } = useRenderGuard('useDashboardData', 15);
  const { shouldLog } = useThrottledLogger('useDashboardData', 1000);

  useEffect(() => {
    const { renderCount, isExcessive } = getRenderStats();
    if (!isExcessive) return;

    dashboardLogger.logRenderCount('useDashboardData', renderCount, isExcessive);

    if (shouldLog()) {
      logger.debug('useDashboardData excessive re-renders detected', {
        renderCount,
        isExcessive,
        hasUserId: !!userId,
        filterCriteriaSignature: JSON.stringify(filterCriteria),
        companiesCount,
        artistsCount,
        companiesSignature,
        artistsSignature,
        selectedTagsSignature,
        filterActiveStatus: filters.activeStatus,
        filterCurrentPage: filters.currentPage,
      });
    }
  }, [
    getRenderStats,
    shouldLog,
    userId,
    companiesSignature,
    artistsSignature,
    selectedTagsSignature,
    filters.activeStatus,
    filters.currentPage,
    filterCriteria,
    companiesCount,
    artistsCount,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    if (projectsQuery.isLoading) {
      logger.info('[DASHBOARD] Loading projects...', {
        currentPage: filters.currentPage,
        activeStatus: filters.activeStatus,
        sortField: filters.sortField,
        sortDirection: filters.sortDirection,
        hasSearchTerm: !!filters.searchTerm,
      });
    } else if (projectsQuery.data && !projectsQuery.isLoading) {
      logger.info('[DASHBOARD] Projects loaded successfully', {
        projectsCount: projectsQuery.data.projects.length,
        totalItems: projectsQuery.data.totalItems,
        totalPages: projectsQuery.data.totalPages,
        isStale: projectsQuery.isStale,
      });
    }
  }, [
    projectsQuery.isLoading,
    projectsQuery.data,
    projectsQuery.isStale,
    filters.currentPage,
    filters.activeStatus,
    filters.sortField,
    filters.sortDirection,
    filters.searchTerm,
  ]);
};
