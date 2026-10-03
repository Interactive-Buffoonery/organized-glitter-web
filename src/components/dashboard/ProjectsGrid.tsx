import React from 'react';
import { usePostHog } from '@posthog/react';
import { FlowerPotIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import ProjectGridCard from '@/components/dashboard/ProjectGridCard';
import ProjectListRow from '@/components/dashboard/ProjectListRow';
import ProjectsTable from '@/components/dashboard/ProjectsTable';
import { ProjectType } from '@/types/project';
import { useFilters, useFilterHelpers } from '@/contexts/FilterContext';
import { useAuth } from '@/hooks/useAuth';
import { useSortDividers } from '@/hooks/useSortDividers';
import { useUndatedProjectCount } from '@/hooks/queries/useUndatedProjectCount';
import LibraryPagination from '@/components/ui/LibraryPagination';
import { useNavigateToProject } from '@/hooks/useNavigateToProject';
import { useRecentlyEdited } from '@/contexts/RecentlyEditedContext';
import { useDashboardEmptyState } from '@/hooks/useDashboardEmptyState';
import { AnalyticsEvent } from '@/services/analytics-events';
import { getPageScrollY } from '@/utils/scrollPosition';
import { setDiamondDashboardParams } from '@/contexts/FilterContext/urlHydration';

interface ProjectsGridProps {
  isCorrectingPage?: boolean;
  dashboardData: {
    projects: ProjectType[];
    totalItems: number;
    totalPages: number;
    isLoadingProjects: boolean;
    isFetchingProjects: boolean;
    errorProjects: Error | null;
    refetchProjects: () => void;
  };
}

interface ProjectsWithDividersProps {
  projects: ProjectType[];
  dividers: ReturnType<typeof useSortDividers>['dividers'];
  renderProject: (project: ProjectType) => React.ReactElement;
  fullWidthClassName: string;
}

function ProjectsWithDividers({
  projects,
  dividers,
  renderProject,
  fullWidthClassName,
}: ProjectsWithDividersProps) {
  const elements: React.ReactElement[] = [];
  const dividerByIndex = new Map(dividers.map(d => [d.insertBeforeIndex, d]));

  projects.forEach((project, index) => {
    const divider = dividerByIndex.get(index);
    if (divider) {
      elements.push(
        <div
          key={`divider-${divider.label}`}
          className={cn(
            fullWidthClassName,
            'bg-muted/50 text-muted-foreground rounded-md px-3 py-2 text-sm font-semibold tracking-wide uppercase'
          )}
        >
          {divider.label}
        </div>
      );
    }
    elements.push(renderProject(project));
  });

  return <>{elements}</>;
}

const ProjectsGridComponent: React.FC<ProjectsGridProps> = ({
  dashboardData,
  isCorrectingPage = false,
}) => {
  const location = useLocation();
  const navigateToProject = useNavigateToProject();
  const posthog = usePostHog();
  const { recentlyEditedProjectId } = useRecentlyEdited();
  const { filters } = useFilters();
  const { user } = useAuth();
  const { clearActiveFilters, updatePage, updatePageSize, updateSort } = useFilterHelpers();
  const emptyState = useDashboardEmptyState();

  const {
    projects,
    isLoadingProjects: loading,
    isFetchingProjects,
    totalItems,
    totalPages,
  } = dashboardData;
  const { viewType, sortField, currentPage, pageSize, sortDirection } = filters;
  const getPageHref = React.useCallback(
    (page: number) => {
      const params = setDiamondDashboardParams(new URLSearchParams(location.search), {
        ...filters,
        currentPage: page,
      });
      const search = params.toString();
      return `${location.pathname}${search ? `?${search}` : ''}`;
    },
    [filters, location.pathname, location.search]
  );

  const { count: undatedCount } = useUndatedProjectCount(user?.id, sortField, filters);
  const dividerConfig = useSortDividers(sortField, projects, {
    totalUndatedCount: undatedCount,
  });

  const handleProjectNavigate = React.useCallback(
    (projectId: string) => {
      const position = projects.findIndex(project => project.id === projectId);
      const scrollPosition = getPageScrollY();
      navigateToProject(projectId, {
        analytics: {
          fromSort: sortField,
          fromStatus: filters.activeStatus,
          position: position >= 0 ? position + 1 : undefined,
        },
        // Snapshot the live filter/sort/pagination state so the detail page's
        // back button can restore the same view. Mirrors the auto-save shape
        // (see DashboardFilterContext) so a single helper rehydrates either.
        dashboardContext: {
          filters: {
            status: filters.activeStatus,
            company: filters.selectedCompany,
            artist: filters.selectedArtist,
            drillShape: filters.selectedDrillShape,
            yearFinished: filters.selectedYearFinished,
            includeMiniKits: filters.includeMiniKits,
            includeDestashed: filters.includeDestashed,
            includeArchived: filters.includeArchived,
            searchTerm: filters.searchTerm,
            searchAllFields: filters.searchAllFields,
            selectedTags: filters.selectedTags,
          },
          sortField: filters.sortField,
          sortDirection: filters.sortDirection,
          currentPage: filters.currentPage,
          pageSize: filters.pageSize,
          preservationContext: {
            scrollPosition,
            timestamp: Date.now(),
          },
        },
      });
    },
    [filters, sortField, navigateToProject, projects]
  );

  const handleTableSort = React.useCallback(
    (nextSortField: typeof sortField, nextSortDirection: 'asc' | 'desc') => {
      updateSort(nextSortField, nextSortDirection);
      posthog.capture(AnalyticsEvent.DASHBOARD_SORT_CHANGED, {
        field: nextSortField,
        direction: nextSortDirection,
        surface: 'table',
      });
    },
    [posthog, updateSort]
  );

  if (loading || isCorrectingPage) {
    if (viewType === 'table') {
      const stickyHeadClass = 'sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]';
      return (
        <>
          <div className="space-y-3 lg:hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="border-border bg-card flex animate-pulse overflow-hidden rounded-xl border shadow-sm"
              >
                <div className="bg-muted size-24 flex-shrink-0" />
                <div className="flex flex-1 items-center gap-3 p-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="bg-muted h-4 w-3/4 rounded" />
                    <div className="bg-muted h-3 w-1/2 rounded" />
                    <div className="bg-muted h-3 w-2/3 rounded" />
                  </div>
                  <div className="bg-muted h-6 w-20 flex-shrink-0 rounded-full" />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-card hidden overflow-x-auto rounded-xl border lg:block">
            <table className="min-w-[68rem] caption-bottom text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className={cn(stickyHeadClass, 'w-16')}>Thumbnail</TableHead>
                  <TableHead className={cn(stickyHeadClass, 'min-w-[16rem]')}>Kit</TableHead>
                  <TableHead className={cn(stickyHeadClass, 'w-28 text-center')}>Status</TableHead>
                  <TableHead className={cn(stickyHeadClass, 'w-40')}>Company</TableHead>
                  <TableHead className={cn(stickyHeadClass, 'w-36')}>Size · Shape</TableHead>
                  <TableHead className={cn(stickyHeadClass, 'w-36')}>Latest</TableHead>
                  <TableHead className={cn(stickyHeadClass, 'w-12')}>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="bg-muted size-12 animate-pulse rounded-md" />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <div className="bg-muted h-4 w-40 animate-pulse rounded" />
                        <div className="bg-muted h-3 w-24 animate-pulse rounded" />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="bg-muted mx-auto h-6 w-20 animate-pulse rounded-full" />
                    </TableCell>
                    <TableCell>
                      <div className="bg-muted h-4 w-24 animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="bg-muted h-4 w-20 animate-pulse rounded" />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="bg-muted h-3 w-16 animate-pulse rounded" />
                        <div className="bg-muted h-3 w-20 animate-pulse rounded" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="bg-muted ml-auto size-4 animate-pulse rounded-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
        </>
      );
    }

    if (viewType === 'list') {
      return (
        <div className="space-y-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="border-border bg-card animate-pulse overflow-hidden rounded-xl border shadow-sm"
            >
              <div className="flex">
                <div className="bg-muted size-24" />
                <div className="flex flex-1 items-center justify-between p-4">
                  <div className="space-y-2">
                    <div className="bg-muted h-4 w-48 rounded" />
                    <div className="bg-muted h-6 w-24 rounded" />
                  </div>
                  <div className="bg-muted h-6 w-24 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="border-border bg-card animate-pulse overflow-hidden rounded-xl border shadow-sm"
          >
            <div className="bg-muted h-48 sm:h-52" />
            <div className="space-y-2 p-4">
              <div className="flex h-10 items-start">
                <div className="bg-muted h-4 w-3/4 rounded-md" />
              </div>
              <div className="flex h-6 items-center">
                <div className="bg-muted h-6 w-20 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <section
        aria-label="Project results"
        className="border-border bg-card rounded-xl border px-6 py-12 text-center shadow-sm sm:px-10"
      >
        <div className="bg-muted border-border mx-auto mb-6 flex size-24 items-center justify-center rounded-xl border">
          <HugeiconsIcon
            icon={FlowerPotIcon}
            size={48}
            strokeWidth={1.8}
            aria-hidden="true"
            className="text-primary"
          />
        </div>

        <h2 className="text-card-foreground text-2xl leading-tight font-semibold">
          {emptyState.title}
        </h2>
        <p className="text-muted-foreground mx-auto mt-3 max-w-md leading-relaxed">
          {emptyState.description}
        </p>

        <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
          {emptyState.isUnfiltered ? (
            <Button
              asChild
              variant="default"
              size="lg"
              className="text-base pointer-coarse:min-h-11"
            >
              <Link to="/projects/new">Add New Project</Link>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="text-base"
              onClick={() => clearActiveFilters()}
            >
              Clear Filters
            </Button>
          )}
        </div>
      </section>
    );
  }

  const renderGridBranch = () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <ProjectsWithDividers
        projects={projects}
        dividers={dividerConfig.dividers}
        fullWidthClassName="col-span-full my-4"
        renderProject={project => (
          <ProjectGridCard
            key={project.id}
            project={project}
            onNavigate={handleProjectNavigate}
            isRecentlyEdited={project.id === recentlyEditedProjectId}
            sortField={sortField}
          />
        )}
      />
    </div>
  );

  const renderListBranch = () => (
    <div role="list" aria-label="Projects" className="space-y-4">
      <ProjectsWithDividers
        projects={projects}
        dividers={dividerConfig.dividers}
        fullWidthClassName="my-4"
        renderProject={project => (
          <ProjectListRow
            key={project.id}
            project={project}
            onNavigate={handleProjectNavigate}
            isRecentlyEdited={project.id === recentlyEditedProjectId}
          />
        )}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      {viewType === 'table' ? (
        <ProjectsTable
          projects={projects}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleTableSort}
          onNavigate={handleProjectNavigate}
          recentlyEditedProjectId={recentlyEditedProjectId}
          dividers={dividerConfig.dividers}
        />
      ) : viewType === 'list' ? (
        renderListBranch()
      ) : (
        renderGridBranch()
      )}

      {totalItems > 0 && (
        <LibraryPagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={updatePage}
          onPageSizeChange={updatePageSize}
          getPageHref={getPageHref}
          itemLabel="project"
          itemsLabel="projects"
          disabled={totalPages <= 1}
          isLoading={isFetchingProjects}
        />
      )}
    </div>
  );
};

export default React.memo(ProjectsGridComponent);
