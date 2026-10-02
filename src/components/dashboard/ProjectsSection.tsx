import React from 'react';
import ProjectsGrid from '@/components/dashboard/ProjectsGrid';
import DashboardStatusSegments from '@/components/dashboard/DashboardStatusSegments';
import ResultsSummaryBar from '@/components/dashboard/ResultsSummaryBar';
import { useDashboardStatusCounts } from '@/hooks/queries/useDashboardStatusCounts';
import { useAuth } from '@/hooks/useAuth';
import { useFilterHelpers, useFilters } from '@/contexts/FilterContext';
import { getActiveFilterSummary } from '@/contexts/FilterContext/types';
import { useDashboardPerformance } from '@/hooks/useDashboardPerformance';
import { useAppReady } from '@/hooks/useAppReady';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';

interface ProjectsSectionProps {
  isCorrectingPage?: boolean;
  dashboardData: {
    projects: import('@/types/project').ProjectType[];
    totalItems: number;
    totalItemsIsEstimate: boolean;
    totalPages: number;
    isLoadingProjects: boolean;
    isFetchingProjects: boolean;
    errorProjects: Error | null;
    refetchProjects: () => void;
  };
}

const ProjectsSectionComponent = ({ dashboardData, isCorrectingPage }: ProjectsSectionProps) => {
  const { user } = useAuth();
  const { filters, activeFilterCount } = useFilters();
  const { updateStatus, clearActiveFilters } = useFilterHelpers();
  const activeFilterLabel = getActiveFilterSummary(filters);

  const statusCounts = useDashboardStatusCounts(user?.id, filters);

  useDashboardPerformance(dashboardData.isLoadingProjects);

  // Dismiss splash on mount; projects still use in-app loading UI.
  useAppReady();

  return (
    <div className="space-y-6 lg:col-span-3">
      {dashboardData.errorProjects &&
        !ErrorHandler.isCancelledError(dashboardData.errorProjects) && (
          <div className="rounded-md border border-red-500 p-4 text-red-500">
            <p>Error loading projects: {dashboardData.errorProjects.message}</p>
            <p>Please try refreshing the page or contact support if the issue persists.</p>
          </div>
        )}

      <DashboardStatusSegments
        activeStatus={filters.activeStatus}
        displayedCounts={statusCounts.displayedCounts}
        isLoadingCounts={statusCounts.isLoading}
        hasCountError={!!statusCounts.error}
        onStatusChange={updateStatus}
      />

      <ResultsSummaryBar
        totalItems={dashboardData.totalItems}
        totalItemsIsEstimate={dashboardData.totalItemsIsEstimate}
        isLoading={dashboardData.isLoadingProjects}
        sortField={filters.sortField}
        sortDirection={filters.sortDirection}
        activeFilterCount={activeFilterCount}
        activeFilterLabel={activeFilterLabel}
        onClearAll={clearActiveFilters}
      />

      <ProjectsGrid dashboardData={dashboardData} isCorrectingPage={isCorrectingPage} />
    </div>
  );
};

export default React.memo(ProjectsSectionComponent);
