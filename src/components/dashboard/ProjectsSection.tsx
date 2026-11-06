import React from 'react';
import { Button } from '@/components/ui/button';
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

  const hasLoadError =
    dashboardData.errorProjects && !ErrorHandler.isCancelledError(dashboardData.errorProjects);
  const errorNotice = hasLoadError ? (
    <div role="alert" className="border-border space-y-3 rounded-xl border p-5">
      <p className="text-foreground font-medium">Could not load your projects</p>
      <p className="text-muted-foreground text-sm">Please try again. Your library is still here.</p>
      <Button type="button" variant="glass" onClick={() => dashboardData.refetchProjects()}>
        Try again
      </Button>
    </div>
  ) : null;

  if (hasLoadError && dashboardData.projects.length === 0) {
    return <div className="lg:col-span-3">{errorNotice}</div>;
  }

  return (
    <div className="space-y-6 lg:col-span-3">
      {errorNotice}

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
