import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useProjectStatus } from '@/hooks/useProjectStatus';
import { ProjectType } from '@/types/project';
import type { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';
import { getGridMetadataLine } from './projectsTableUtils';
import ProjectThumbnail from './ProjectThumbnail';

interface ProjectGridCardProps {
  project: ProjectType;
  onClick?: () => void;
  onNavigate?: (projectId: string) => void;
  skipImageLoading?: boolean;
  isRecentlyEdited?: boolean;
  sortField?: DashboardValidSortField;
}

const ProjectGridCardComponent = ({
  project,
  onClick,
  onNavigate,
  skipImageLoading = false,
  isRecentlyEdited = false,
  sortField = 'last_updated',
}: ProjectGridCardProps) => {
  const { getStatusColor, getStatusLabel } = useProjectStatus();

  const handleClick = useCallback(() => {
    if (onNavigate) {
      onNavigate(project.id);
      return;
    }

    onClick?.();
  }, [onClick, onNavigate, project.id]);

  const statusLabel =
    project.status === 'purchased'
      ? 'Purchased'
      : project.status === 'kitted'
        ? 'Kitted Up'
        : getStatusLabel(project.status);

  const metadata = getGridMetadataLine(project, sortField);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'glow-hover text-card-foreground focus-visible:ring-ring group flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border text-left shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 focus-visible:ring-2 focus-visible:outline-none',
        isRecentlyEdited
          ? 'border-accent bg-accent/10 ring-accent ring-opacity-50 ring-2'
          : 'border-border bg-card hover:border-primary/20'
      )}
      aria-label={`Open project ${project.title}`}
    >
      <div className="bg-muted relative h-48 w-full sm:h-52">
        <ProjectThumbnail
          imageUrl={project.imageUrl}
          title={project.title}
          skipImageLoading={skipImageLoading}
        />
      </div>

      <div className="p-4">
        <div className="space-y-2">
          <div className="flex h-10 items-start">
            <h3 className="group-hover:text-link line-clamp-2 text-sm leading-tight font-semibold transition-colors duration-200">
              {project.title}
            </h3>
          </div>

          <p
            data-testid="grid-metadata-line"
            className={cn(
              'text-muted-foreground flex h-5 items-center truncate text-xs',
              metadata.tabularNums && 'tabular-nums'
            )}
          >
            {metadata.text}
          </p>

          <div className="flex h-6 items-center justify-between gap-2">
            <div className="flex items-center">
              {(project.kitCategory || project.drillShape) && (
                <span className="bg-muted/50 text-muted-foreground group-hover:bg-muted/70 rounded-md px-2 py-1 text-xs transition-colors duration-200">
                  {project.kitCategory && (
                    <span className="font-medium">
                      {project.kitCategory === 'mini' ? 'Mini' : 'Full'}
                    </span>
                  )}
                  {project.kitCategory && project.drillShape && <span className="mx-1">•</span>}
                  {project.drillShape && <span className="capitalize">{project.drillShape}</span>}
                </span>
              )}
            </div>
            <span
              className={cn(
                'flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium shadow-md transition-all duration-200 group-hover:scale-105',
                getStatusColor(project.status)
              )}
            >
              {statusLabel}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
};

export default React.memo(ProjectGridCardComponent);
