import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useProjectStatus } from '@/hooks/useProjectStatus';
import { ProjectType } from '@/types/project';
import type { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';
import { PROJECTS_TABLE_COLUMNS } from '@/features/dashboard/table-columns';
import type { DividerPoint } from '@/hooks/useSortDividers';
import { getLifecycleDate, getSizeAndShapeLabel } from './projectsTableUtils';
import ProjectTableCard from './ProjectTableCard';
import ProjectThumbnail from './ProjectThumbnail';

const EMPTY_DIVIDERS: DividerPoint[] = [];

interface ProjectsTableProps {
  projects: ProjectType[];
  sortField: DashboardValidSortField;
  sortDirection: 'asc' | 'desc';
  onSort: (sortField: DashboardValidSortField, sortDirection: 'asc' | 'desc') => void;
  onNavigate: (projectId: string) => void;
  recentlyEditedProjectId?: string | null;
  /**
   * Sort-aware group dividers. When the user sorts by Company/Artist/Status/date,
   * divider rows are injected between groups.
   */
  dividers?: DividerPoint[];
}

const SortIndicator = ({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) => {
  if (!active) return <ArrowUpDown className="text-muted-foreground size-4" aria-hidden="true" />;
  if (direction === 'asc') return <ArrowUp className="size-4" aria-hidden="true" />;
  return <ArrowDown className="size-4" aria-hidden="true" />;
};

const ProjectsTable = ({
  projects,
  sortField,
  sortDirection,
  onSort,
  onNavigate,
  recentlyEditedProjectId,
  dividers = EMPTY_DIVIDERS,
}: ProjectsTableProps) => {
  const { getStatusColor, getStatusLabel } = useProjectStatus();
  const dividerByIndex = React.useMemo(
    () => new Map(dividers.map(d => [d.insertBeforeIndex, d])),
    [dividers]
  );
  const columnCount = PROJECTS_TABLE_COLUMNS.length;

  const renderSortableHeader = (column: (typeof PROJECTS_TABLE_COLUMNS)[number]) => {
    if (!column.sortField) {
      if (column.id === 'actions') {
        return <span className="sr-only">Actions</span>;
      }
      return <span className="text-sm font-medium">{column.label}</span>;
    }

    const isActive = sortField === column.sortField;
    const nextDirection: 'asc' | 'desc' = isActive && sortDirection === 'asc' ? 'desc' : 'asc';

    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          '-ml-3 h-8 px-3 text-sm font-medium',
          column.headerClassName === 'text-center' && 'mx-auto'
        )}
        onClick={() => onSort(column.sortField!, nextDirection)}
      >
        <span>{column.label}</span>
        <SortIndicator active={isActive} direction={sortDirection} />
      </Button>
    );
  };

  const stickyHeadClass = 'sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]';

  return (
    <>
      <div className="space-y-3 lg:hidden">
        {projects.map((project, index) => {
          const divider = dividerByIndex.get(index);
          return (
            <React.Fragment key={project.id}>
              {divider && (
                <div
                  key={`divider-${divider.label}`}
                  className="bg-muted/50 text-muted-foreground mt-2 rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide uppercase"
                >
                  {divider.label}
                </div>
              )}
              <ProjectTableCard
                project={project}
                onNavigate={onNavigate}
                isRecentlyEdited={project.id === recentlyEditedProjectId}
              />
            </React.Fragment>
          );
        })}
      </div>

      <div className="bg-card hidden overflow-x-auto rounded-xl border lg:block">
        <table className="w-full min-w-[68rem] caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              {PROJECTS_TABLE_COLUMNS.map(column => (
                <TableHead
                  key={column.id}
                  aria-sort={
                    column.sortField && sortField === column.sortField
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  className={cn(stickyHeadClass, column.className, column.headerClassName)}
                >
                  {renderSortableHeader(column)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {projects.map((project, index) => {
              const statusLabel =
                project.status === 'purchased'
                  ? 'Purchased'
                  : project.status === 'kitted'
                    ? 'Kitted Up'
                    : getStatusLabel(project.status);
              const lifecycleDate = getLifecycleDate(project);
              const artistLabel = project.artist && project.artist !== '-' ? project.artist : null;
              const divider = dividerByIndex.get(index);

              return (
                <React.Fragment key={project.id}>
                  {divider && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={columnCount}
                        className="bg-muted/50 text-muted-foreground text-sm font-medium"
                      >
                        {divider.label}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow
                    onClick={() => onNavigate(project.id)}
                    className={cn(
                      'cursor-pointer',
                      project.id === recentlyEditedProjectId &&
                        'bg-secondary/50 hover:bg-secondary/70 dark:bg-accent/10 dark:hover:bg-accent/15'
                    )}
                  >
                    <TableCell>
                      <div className="bg-muted relative size-12 overflow-hidden rounded-md">
                        <ProjectThumbnail imageUrl={project.imageUrl} title={project.title} />
                      </div>
                    </TableCell>

                    <TableCell>
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          onNavigate(project.id);
                        }}
                        className="focus-visible:ring-ring w-full text-left focus-visible:ring-2 focus-visible:outline-none"
                        aria-label={`Open project ${project.title}`}
                      >
                        <div className="space-y-0.5">
                          <p className="line-clamp-1 font-medium">{project.title}</p>
                          {artistLabel && (
                            <p className="text-muted-foreground line-clamp-1 text-xs">
                              {artistLabel}
                            </p>
                          )}
                        </div>
                      </button>
                    </TableCell>

                    <TableCell className="text-center">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-3 py-1 text-xs font-medium shadow-md',
                          getStatusColor(project.status)
                        )}
                      >
                        {statusLabel}
                      </span>
                    </TableCell>

                    <TableCell>
                      {project.company || (
                        <span className="text-muted-foreground">Not specified</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {getSizeAndShapeLabel(project)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {lifecycleDate ? (
                        <div className="space-y-0.5">
                          <div className="text-muted-foreground">{lifecycleDate.label}</div>
                          <div className="tabular-nums">{lifecycleDate.value}</div>
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-muted-foreground flex justify-end">
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                      </div>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </table>
      </div>
    </>
  );
};

export default React.memo(ProjectsTable);
