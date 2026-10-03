import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useProjectStatus } from '@/hooks/useProjectStatus';
import { ProjectType } from '@/types/project';
import { getLifecycleDate, getSizeAndShapeLabel } from './projectsTableUtils';
import ProjectThumbnail from './ProjectThumbnail';

interface ProjectTableCardProps {
  project: ProjectType;
  onNavigate: (projectId: string) => void;
  isRecentlyEdited?: boolean;
}

const ProjectTableCardComponent = ({
  project,
  onNavigate,
  isRecentlyEdited = false,
}: ProjectTableCardProps) => {
  const { getStatusColor, getStatusLabel } = useProjectStatus();

  const openProject = useCallback(() => {
    onNavigate(project.id);
  }, [onNavigate, project.id]);

  const statusLabel =
    project.status === 'purchased'
      ? 'Purchased'
      : project.status === 'kitted'
        ? 'Kitted Up'
        : getStatusLabel(project.status);

  const lifecycleDate = getLifecycleDate(project);
  const sizeAndShape = getSizeAndShapeLabel(project);
  const artistLabel = project.artist && project.artist !== '-' ? project.artist : null;
  const companyAndArtist = [project.company, artistLabel].filter(Boolean).join(' · ') || '-';

  return (
    <button
      type="button"
      onClick={openProject}
      className={cn(
        'glow-hover text-card-foreground focus-visible:ring-ring group flex w-full cursor-pointer overflow-hidden rounded-xl border text-left shadow-sm transition-all duration-300 ease-out focus-visible:ring-2 focus-visible:outline-none',
        isRecentlyEdited
          ? 'border-accent bg-accent/10 ring-accent ring-opacity-50 ring-2'
          : 'border-border bg-card hover:border-primary/20'
      )}
      aria-label={`Open project ${project.title}`}
    >
      <div className="bg-muted relative size-24 flex-shrink-0">
        <ProjectThumbnail imageUrl={project.imageUrl} title={project.title} />
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3 p-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="group-hover:text-link line-clamp-1 text-sm leading-tight font-semibold transition-colors duration-200">
            {project.title}
          </h3>
          <p className="text-muted-foreground line-clamp-1 text-xs">{companyAndArtist}</p>
          <p className="text-muted-foreground line-clamp-1 text-xs">
            <span className="tabular-nums">{sizeAndShape}</span>
            {lifecycleDate && (
              <>
                <span className="mx-1.5">·</span>
                <span>
                  {lifecycleDate.label} <span className="tabular-nums">{lifecycleDate.value}</span>
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex-shrink-0">
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium shadow-md transition-all duration-200 group-hover:scale-105',
              getStatusColor(project.status)
            )}
          >
            {statusLabel}
          </span>
        </div>
      </div>
    </button>
  );
};

export default React.memo(ProjectTableCardComponent);
