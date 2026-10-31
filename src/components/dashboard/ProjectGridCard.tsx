import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ProjectType } from '@/types/project';
import type { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';
import { formatKitMetadata, formatLibraryDate } from '@/components/shared/libraryPresentation';
import { StatusPill } from '@/components/shared/StatusPill';
import { FILTER_STATUS_ACTIVE_FILL, PROJECT_FILTER_STATUS_LABEL } from '@/utils/statusColors';
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
}: ProjectGridCardProps) => {
  const handleClick = useCallback(() => {
    if (onNavigate) {
      onNavigate(project.id);
      return;
    }

    onClick?.();
  }, [onClick, onNavigate, project.id]);

  const metadata = formatKitMetadata(project);
  const date = project.updatedAt || project.createdAt;
  const shortDate = date ? formatLibraryDate(date) : '';

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
    >
      <span className="sr-only">Open project </span>
      <div className="bg-muted relative aspect-[4/3] w-full">
        <ProjectThumbnail
          imageUrl={project.imageUrl}
          title={project.title}
          skipImageLoading={skipImageLoading}
        />
      </div>

      <div className="w-full min-w-0 p-3">
        <div className="space-y-2">
          <div className="flex min-h-9 items-start">
            <h3 className="group-hover:text-link line-clamp-2 text-sm leading-tight font-semibold transition-colors duration-200">
              {project.title}
            </h3>
          </div>

          <p
            data-testid="grid-metadata-line"
            className="text-muted-foreground h-5 truncate text-xs"
          >
            {metadata}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusPill
              label={PROJECT_FILTER_STATUS_LABEL[project.status]}
              className={FILTER_STATUS_ACTIVE_FILL[project.status]}
            />
            <span className="text-muted-foreground text-xs" title="Last updated">
              {shortDate}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
};

export default React.memo(ProjectGridCardComponent);
