import { ProjectType, ProjectStatus } from '@/types/project';
import RichUrlComponent from './RichUrlComponent';
import { InlineTagManager } from '@/components/tags/InlineTagManager';
import StatusDropdown from './StatusDropdown';
import { cn } from '@/lib/utils';

interface ProjectDetailsProps {
  project: ProjectType;
  /**
   * `dl`: desktop sidebar layout. <dl> spec list, label on the left, value on the right,
   *   row-gap whitespace doing the dividing work.
   * `list`: mobile inset list. Hairline-divided rows, label/value baseline-aligned.
   *   Reads like iOS Settings.app.
   */
  layout?: 'dl' | 'list';
  /**
   * If provided, a "Status" row is rendered at the top of the list with a live
   * pill-style dropdown. If omitted, no status row appears (read-only contexts).
   */
  onStatusChange?: (status: ProjectStatus) => void;
}

const NOT_SPECIFIED = 'Not specified';

const getDisplayName = (name: string | undefined, fallbackLabel: string): string => {
  if (!name) return NOT_SPECIFIED;
  if (name && name !== 'undefined' && name !== 'null') return name;
  return fallbackLabel;
};

const formatDimensions = (project: ProjectType): string => {
  if (project.width && project.height) return `${project.width} x ${project.height} cm`;
  if (project.width) return `${project.width} cm (width)`;
  if (project.height) return `${project.height} cm (height)`;
  return NOT_SPECIFIED;
};

const formatKitCategory = (kitCategory: string | undefined | null): string => {
  if (kitCategory === 'full') return 'Full Sized Kit';
  if (kitCategory === 'mini') return 'Mini Kit';
  return NOT_SPECIFIED;
};

type Row = { label: string; value: string };

const DRILL_SHAPE_LABELS: Record<string, string> = {
  round: 'Round',
  square: 'Square',
};

const formatDrillShape = (drillShape: string | undefined): string => {
  if (!drillShape) return NOT_SPECIFIED;
  return DRILL_SHAPE_LABELS[drillShape] ?? drillShape;
};

const buildRows = (project: ProjectType): Row[] => [
  { label: 'Company', value: getDisplayName(project.company, 'Company not specified') },
  { label: 'Artist', value: getDisplayName(project.artist, 'Artist not specified') },
  { label: 'Dimensions', value: formatDimensions(project) },
  { label: 'Drill shape', value: formatDrillShape(project.drillShape) },
  { label: 'Kit type', value: formatKitCategory(project.kitCategory) },
  { label: 'Diamonds', value: project.totalDiamonds?.toLocaleString() || NOT_SPECIFIED },
  { label: 'Colors', value: project.colorCount?.toLocaleString() || NOT_SPECIFIED },
];

const isMuted = (value: string) => value === NOT_SPECIFIED || value.endsWith(' not specified');

const ProjectDetails = ({ project, layout = 'dl', onStatusChange }: ProjectDetailsProps) => {
  const rows = buildRows(project);

  const statusDropdown = onStatusChange ? (
    <StatusDropdown currentStatus={project.status} onStatusChange={onStatusChange} variant="pill" />
  ) : null;

  const tagsBlock = (
    <div className={layout === 'dl' ? 'mt-7' : 'pt-5'}>
      <h3 className="text-foreground mb-2 pl-1 text-sm font-semibold tracking-tight">Tags</h3>
      <InlineTagManager projectId={project.id} initialTags={project.tags ?? []} />
    </div>
  );

  const sourceUrlBlock = project.sourceUrl && (
    <div className={layout === 'dl' ? 'mt-7' : 'pt-5'}>
      <h3 className="text-foreground mb-2 pl-1 text-sm font-semibold tracking-tight">Source URL</h3>
      <RichUrlComponent url={project.sourceUrl} />
    </div>
  );

  if (layout === 'list') {
    // Mobile: hairline-divided list, label left / value right (Settings.app)
    return (
      <div>
        <div className="flex flex-col">
          {statusDropdown && (
            <div className="border-border/40 flex items-center justify-between gap-4 border-b py-3">
              <span className="text-muted-foreground text-sm">Status</span>
              {statusDropdown}
            </div>
          )}
          {rows.map((row, i) => {
            const muted = isMuted(row.value);
            return (
              <div
                key={row.label}
                className={cn(
                  'flex items-baseline justify-between gap-4 py-3',
                  i < rows.length - 1 && 'border-border/40 border-b'
                )}
              >
                <span className="text-muted-foreground text-sm">{row.label}</span>
                <span
                  className={cn(
                    'text-right text-sm font-medium',
                    muted ? 'text-muted-foreground/55 font-normal italic' : 'text-foreground'
                  )}
                >
                  {row.value}
                </span>
              </div>
            );
          })}
        </div>
        {tagsBlock}
        {sourceUrlBlock}
      </div>
    );
  }

  // Desktop sidebar: definition list, whitespace doing the dividing
  return (
    <div>
      <dl
        className="grid items-baseline gap-x-7 gap-y-3.5 text-sm"
        style={{ gridTemplateColumns: 'max-content 1fr' }}
      >
        {statusDropdown && (
          <div className="contents">
            <dt className="text-muted-foreground self-center text-[11px] font-semibold tracking-[0.1em] uppercase">
              Status
            </dt>
            <dd className="m-0 self-center justify-self-start">{statusDropdown}</dd>
          </div>
        )}
        {rows.map(row => {
          const muted = isMuted(row.value);
          return (
            <div key={row.label} className="contents">
              <dt className="text-muted-foreground self-center text-sm">{row.label}</dt>
              <dd
                className={cn(
                  'm-0 font-medium',
                  muted ? 'text-muted-foreground/70 font-normal italic' : 'text-foreground'
                )}
              >
                {row.value}
              </dd>
            </div>
          );
        })}
      </dl>
      {tagsBlock}
      {sourceUrlBlock}
    </div>
  );
};

export default ProjectDetails;
