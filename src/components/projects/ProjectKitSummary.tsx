import { useState } from 'react';
import { SectionHeading } from '@/components/shared/Section';
import { Button } from '@/components/ui/button';
import { InlineTagManager } from '@/components/tags/InlineTagManager';
import StatusDropdown from './StatusDropdown';
import TimelineDateEditor, { type TimelineDateEditorState } from './timeline/TimelineDateEditor';
import { ProjectSpecStrip, StatusDatePrompt, type KitField } from './ProjectDetailFacts';
import KitFieldEditor from './KitFieldEditor';
import {
  getProjectDayLabel,
  getVisibleProjectDates,
  PROJECT_DATES,
  formatKitDate,
} from './projectDetailDates';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDateInUserTimezone } from '@/utils/date/timezoneUtils';
import type { ProjectStatus, ProjectType } from '@/types/project';
import { safeKitUrl } from './projectDetailUrl';

export function ProjectStatusSummary({
  project,
  onStatusChange,
  disabled = false,
}: {
  project: ProjectType;
  onStatusChange: (status: ProjectStatus) => void;
  disabled?: boolean;
}) {
  const [field, setField] = useState<KitField | null>(null);
  const [dateEditorState, setDateEditorState] = useState<TimelineDateEditorState | null>(null);
  const timezone = useUserTimezone();
  const day = getProjectDayLabel(
    project,
    formatDateInUserTimezone(new Date(), timezone, 'yyyy-MM-dd')
  );
  const dates = getVisibleProjectDates(project);
  const editingHiddenDate =
    dateEditorState && !dates.some(date => date.key === dateEditorState.dateKey);
  const visibleDates = editingHiddenDate
    ? PROJECT_DATES.filter(date => dates.includes(date) || date.key === dateEditorState.dateKey)
    : dates;
  return (
    <div>
      <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
        <StatusDropdown
          currentStatus={project.status}
          onStatusChange={onStatusChange}
          variant="pill"
          disabled={disabled}
        />
        {day && (
          <span className="text-muted-foreground text-right text-xs tabular-nums">{day}</span>
        )}
      </div>
      <StatusDatePrompt
        project={project}
        disabled={disabled}
        onPickDate={key => setDateEditorState({ projectId: project.id, dateKey: key, draft: '' })}
      />
      <ProjectSpecStrip project={project} onEdit={setField} disabled={disabled} />
      <div
        aria-label="Project dates"
        className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-1 text-xs leading-relaxed"
      >
        {visibleDates.map((date, index) => (
          <span key={date.key} className="inline-flex items-center gap-1">
            {index > 0 && <span aria-hidden="true">·</span>}
            {project[date.key] && <span>{date.label}</span>}
            <TimelineDateEditor
              dateKey={date.key}
              label={date.label}
              value={project[date.key]}
              projectId={project.id}
              currentStatus={project.status}
              isSet={Boolean(project[date.key])}
              formattedDisplay={
                project[date.key] ? formatKitDate(project[date.key]!, timezone) : ''
              }
              emptyDisplay={date.addLabel}
              className="min-h-11 not-italic"
              editorState={dateEditorState}
              onEditorStateChange={setDateEditorState}
            />
          </span>
        ))}
      </div>
      {field && (
        <KitFieldEditor
          key={`${project.id}:${field}`}
          project={project}
          field={field}
          onClose={() => setField(null)}
        />
      )}
    </div>
  );
}

export function ProjectKitAbout({ project }: { project: ProjectType }) {
  const [field, setField] = useState<KitField | null>(null);
  const href = safeKitUrl(project.sourceUrl);
  const rows: { field: KitField; label: string; value?: string }[] = [
    { field: 'company', label: 'Company', value: project.company },
    { field: 'artist', label: 'Artist', value: project.artist },
    {
      field: 'kitCategory',
      label: 'Kit type',
      value:
        project.kitCategory === 'full'
          ? 'Full sized kit'
          : project.kitCategory === 'mini'
            ? 'Mini kit'
            : undefined,
    },
    { field: 'sourceUrl', label: 'Kit link', value: project.sourceUrl },
  ];
  return (
    <section className="border-border/60 border-t pt-6">
      <SectionHeading className="mb-3">About this kit</SectionHeading>
      <dl className="text-sm">
        {rows.map(row => (
          <div
            key={row.field}
            className="border-border/40 flex min-h-11 items-center justify-between gap-4 border-b last:border-b-0"
          >
            <dt className="text-muted-foreground shrink-0">{row.label}</dt>
            <dd className="min-w-0 text-right">
              {row.field === 'sourceUrl' && href ? (
                <div className="flex items-center">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="decoration-primary/50 inline-flex min-h-11 items-center truncate underline underline-offset-4"
                  >
                    {new URL(href).hostname} ↗
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11"
                    aria-label="Edit kit link"
                    onClick={() => setField(row.field)}
                  >
                    Edit
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto min-h-11 max-w-full px-0 text-right whitespace-normal"
                  onClick={() => setField(row.field)}
                  aria-label={`${row.value ? 'Edit' : 'Add'} ${row.label.toLowerCase()}`}
                >
                  <span className={row.value ? 'text-foreground' : 'text-primary'}>
                    {row.value || 'Add'}
                  </span>
                </Button>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {field && (
        <KitFieldEditor
          key={`${project.id}:${field}`}
          project={project}
          field={field}
          onClose={() => setField(null)}
        />
      )}
    </section>
  );
}

export function ProjectKitTags({ project }: { project: ProjectType }) {
  return (
    <section className="border-border/60 border-t pt-6">
      <SectionHeading className="mb-3">Tags</SectionHeading>
      <InlineTagManager projectId={project.id} initialTags={project.tags ?? []} />
    </section>
  );
}
