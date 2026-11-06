import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SpecStrip } from '@/components/shared/SpecStrip';
import { useUpdateProjectDatesSectionMutation } from '@/hooks/mutations/useProjectDetailMutations';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDateInUserTimezone } from '@/utils/date/timezoneUtils';
import type { DateFieldKey } from '@/hooks/mutations/projectCommands';
import type { ProjectType } from '@/types/project';
import { safeKitUrl } from './projectDetailUrl';

export type KitField =
  | 'size'
  | 'totalDiamonds'
  | 'drillShape'
  | 'colorCount'
  | 'company'
  | 'artist'
  | 'kitCategory'
  | 'sourceUrl';

export function ProjectByline({ project }: { project: ProjectType }) {
  const href = safeKitUrl(project.sourceUrl);
  return (
    <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-1.5 text-sm">
      {project.company &&
        (href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground decoration-primary/50 inline-flex min-h-11 items-center font-semibold underline decoration-2 underline-offset-4"
          >
            {project.company}
            <ArrowUpRight aria-hidden="true" className="ml-1 size-3.5" />
          </a>
        ) : (
          <span className="text-foreground font-semibold">{project.company}</span>
        ))}
      {project.company && project.artist && <span aria-hidden="true">·</span>}
      {project.artist && <span>art by {project.artist}</span>}
    </div>
  );
}

export function ProjectSpecStrip({
  project,
  onEdit,
  disabled = false,
}: {
  project: ProjectType;
  onEdit: (field: KitField) => void;
  disabled?: boolean;
}) {
  return (
    <SpecStrip
      items={[
        {
          key: 'size',
          label: 'size',
          value:
            project.width || project.height
              ? `${project.width ?? '?'} × ${project.height ?? '?'} cm`
              : undefined,
        },
        { key: 'totalDiamonds', label: 'drills', value: project.totalDiamonds?.toLocaleString() },
        {
          key: 'drillShape',
          label: 'drill shape',
          value: project.drillShape
            ? project.drillShape[0].toUpperCase() + project.drillShape.slice(1)
            : undefined,
        },
        { key: 'colorCount', label: 'colors', value: project.colorCount?.toLocaleString() },
      ].map(item => ({ ...item, disabled, onEdit: () => onEdit(item.key as KitField) }))}
    />
  );
}

export function StatusDatePrompt({
  project,
  onPickDate,
  disabled = false,
}: {
  project: ProjectType;
  onPickDate: (key: DateFieldKey) => void;
  disabled?: boolean;
}) {
  const updateDates = useUpdateProjectDatesSectionMutation();
  const timezone = useUserTimezone();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const key =
    project.status === 'completed'
      ? 'dateCompleted'
      : project.status === 'progress'
        ? 'dateStarted'
        : null;
  const identity = `${project.id}:${project.status}`;
  if (!key || project[key] || dismissed === identity) return null;
  return (
    <div className="border-border/60 bg-card my-3 rounded-xl border p-3 text-sm">
      <p>{key === 'dateCompleted' ? 'Did you finish it today?' : 'Did you start it today?'}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          disabled={disabled || updateDates.isPending}
          onClick={() =>
            updateDates.mutate({
              projectId: project.id,
              [key]: formatDateInUserTimezone(new Date(), timezone, 'yyyy-MM-dd'),
            })
          }
        >
          Yes, today
        </Button>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="min-h-11"
          disabled={disabled || updateDates.isPending}
          onClick={() => onPickDate(key)}
        >
          Pick a date
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground min-h-11"
          onClick={() => setDismissed(identity)}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
