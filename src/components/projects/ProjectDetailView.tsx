/**
 * @fileoverview Project detail view component
 *
 * Editorial / airy layout: sticky meta sidebar on the right (desktop) or a
 * quiet inset list above the timeline (mobile). Whitespace separates regions
 * instead of stacked cards. iOS / macOS reading rhythm: hairline dividers
 * between rows, hover-revealed pencils.
 *
 * @author serabi
 * @since 2025-07-02
 */

import { sessionDraftKeys } from '@/services/auth/sessionDraftKeys';
import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectType, ProjectStatus, ProgressNote } from '@/types/project';
import type { DashboardFilterContext } from '@/hooks/mutations/useSaveNavigationContext';
import ImageGallery from '@/components/projects/ImageGallery';
import ProjectCoverImageEditor from '@/components/projects/ProjectCoverImageEditor';
import ProjectDetails from '@/components/projects/ProjectDetails';
import ProjectNotes from '@/components/projects/form/ProjectNotes';
import ProjectProgressNotes from '@/components/projects/ProjectProgressNotes';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PocketBaseUser } from '@/contexts/AuthContext';
import { formatProjectDate } from '@/utils/date/formatProjectDate';
import TimelineDateEditor, {
  type TimelineDateEditorState,
} from '@/components/projects/timeline/TimelineDateEditor';
import type { DateFieldKey } from '@/hooks/mutations/projectCommands';
import { cn } from '@/lib/utils';

interface ProjectDetailViewProps {
  project: ProjectType & {
    progressNotes?: ProgressNote[];
  };
  isMobile: boolean;
  navigationState?: {
    from?: string;
    randomizerState?: {
      selectedProjects: string[];
      shareUrl: string;
    };
    /** Forwarded from the dashboard so the back button can restore filters. */
    dashboardContext?: DashboardFilterContext;
  };
  onStatusChange: (status: ProjectStatus) => void;
  onUpdateNotes: (notes: string) => Promise<void>;
  onArchive: () => void;
  onDelete: () => void;
  navigateToEdit: () => void;
  isSubmitting?: boolean;
  user: PocketBaseUser | null;
}

type TimelineStep = {
  key: string;
  dateKey: DateFieldKey;
  label: string;
  raw: string | null | undefined;
  value: string;
  isSet: boolean;
};

const buildTimeline = (project: ProjectType): TimelineStep[] => {
  const make = (
    key: string,
    dateKey: DateFieldKey,
    label: string,
    raw: string | null | undefined
  ): TimelineStep => {
    const value = formatProjectDate(raw);
    return { key, dateKey, label, raw, value, isSet: Boolean(raw) && value !== 'Not specified' };
  };
  return [
    make('purchased', 'datePurchased', 'Purchased', project.datePurchased),
    make('received', 'dateReceived', 'Received', project.dateReceived),
    make('started', 'dateStarted', 'Started', project.dateStarted),
    make('completed', 'dateCompleted', 'Completed', project.dateCompleted),
  ];
};

const SectionLabel = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <h2
    className={cn(
      'text-foreground mb-3 inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight',
      className
    )}
  >
    <span aria-hidden="true" className="bg-primary inline-block h-[2px] w-[22px] rounded-sm" />
    {children}
  </h2>
);

const ProjectActionsMenu = ({
  open,
  onOpenChange,
  onArchive,
  onDeleteSelect,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchive: () => void;
  onDeleteSelect: (event: Event) => void;
  isSubmitting: boolean;
}) => (
  <DropdownMenu open={open} onOpenChange={onOpenChange}>
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="More project actions"
        disabled={isSubmitting}
        className="text-muted-foreground/75 hover:text-foreground"
      >
        <MoreHorizontal className="size-[18px]" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-[180px]">
      <DropdownMenuItem onSelect={onArchive}>Archive project</DropdownMenuItem>
      <DropdownMenuItem
        onSelect={onDeleteSelect}
        className="text-destructive-text focus:text-destructive-text"
      >
        Delete project
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const ProjectDeleteDialog = ({
  open,
  onOpenChange,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
        <AlertDialogDescription>
          This will permanently delete your project. This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={onDelete}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

const ProjectHeroImage = ({ project }: { project: ProjectType }) => (
  <div className="relative">
    {project.imageUrl ? (
      <>
        <div className="overflow-hidden rounded-2xl shadow-sm">
          <ImageGallery imageUrl={project.imageUrl} alt={project.title} previewFit="contain" />
        </div>
        <div className="absolute top-3 right-3">
          <ProjectCoverImageEditor project={project} />
        </div>
      </>
    ) : (
      <div className="bg-card border-border flex aspect-[5/4] items-center justify-center rounded-2xl border px-5">
        <div className="flex max-w-[280px] flex-col items-center text-center">
          <p className="text-foreground text-lg font-semibold">No cover photo yet</p>
          <p className="text-muted-foreground mt-2 mb-5 text-sm leading-relaxed">
            Add a photo of your kit or work in progress.
          </p>
          <ProjectCoverImageEditor project={project} />
        </div>
      </div>
    )}
  </div>
);

const HorizontalTimeline = ({
  timeline,
  projectId,
  status,
  editorState,
  onEditorStateChange,
}: {
  timeline: TimelineStep[];
  projectId: string;
  status: ProjectStatus;
  editorState: TimelineDateEditorState | null;
  onEditorStateChange: Dispatch<SetStateAction<TimelineDateEditorState | null>>;
}) => (
  <div className="grid grid-cols-4">
    {timeline.map((step, i) => {
      const isFirst = i === 0;
      const isLast = i === timeline.length - 1;
      return (
        <div key={step.key} className="relative flex flex-col items-start">
          {!isLast && (
            <span
              aria-hidden="true"
              className="bg-border absolute top-[5px] left-[12px] -z-0 h-px"
              style={{ right: 0 }}
            />
          )}
          <span
            className={cn(
              'relative z-10 size-3 rounded-full border-2',
              step.isSet
                ? 'border-primary bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.18)]'
                : 'border-border bg-background'
            )}
          />
          <p
            className={cn(
              'text-muted-foreground/80 mt-4 text-xs font-medium',
              isFirst ? '-ml-px' : ''
            )}
          >
            {step.label}
          </p>
          <TimelineDateEditor
            dateKey={step.dateKey}
            label={step.label}
            value={step.raw}
            projectId={projectId}
            currentStatus={status}
            isSet={step.isSet}
            formattedDisplay={step.value}
            className="mt-1 text-sm"
            editorState={editorState}
            onEditorStateChange={onEditorStateChange}
          />
        </div>
      );
    })}
  </div>
);

const VerticalTimeline = ({
  timeline,
  projectId,
  status,
  editorState,
  onEditorStateChange,
}: {
  timeline: TimelineStep[];
  projectId: string;
  status: ProjectStatus;
  editorState: TimelineDateEditorState | null;
  onEditorStateChange: Dispatch<SetStateAction<TimelineDateEditorState | null>>;
}) => (
  <div className="relative pl-[22px]">
    <div className="bg-border absolute top-2 bottom-2 left-[6px] w-px" aria-hidden="true" />
    {timeline.map(step => (
      <div key={step.key} className="relative flex items-baseline justify-between gap-4 pb-[18px]">
        <div
          className={cn(
            'absolute top-[5px] -left-[22px] size-[13px] rounded-full border-2',
            step.isSet
              ? 'border-primary bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]'
              : 'border-border bg-background'
          )}
        />
        <span className="text-muted-foreground text-xs font-medium">{step.label}</span>
        <TimelineDateEditor
          dateKey={step.dateKey}
          label={step.label}
          value={step.raw}
          projectId={projectId}
          currentStatus={status}
          isSet={step.isSet}
          formattedDisplay={step.value}
          className="text-sm"
          editorState={editorState}
          onEditorStateChange={onEditorStateChange}
        />
      </div>
    ))}
  </div>
);

const ProjectTitleBlock = ({ project }: { project: ProjectType }) => (
  <div className="min-w-0 flex-1">
    <h1
      className={cn(
        'font-handwritten text-foreground m-0 leading-[1.05] tracking-tight',
        'text-[40px] sm:text-[clamp(40px,5.5vw,64px)]'
      )}
    >
      {project.title || 'Untitled Project'}
    </h1>
    {!project.title && (
      <p className="text-destructive-text mt-1 text-xs">Warning: Project title is missing</p>
    )}
    {project.company && (
      <div className="text-muted-foreground mt-2 text-base font-medium">{project.company}</div>
    )}
  </div>
);

const ProjectDetailView = ({
  project,
  isMobile,
  navigationState,
  onStatusChange,
  onUpdateNotes,
  onArchive,
  onDelete,
  navigateToEdit,
  isSubmitting = false,
  user,
}: ProjectDetailViewProps) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [dateEditorState, setDateEditorState] = useState<TimelineDateEditorState | null>(null);
  const navigate = useNavigate();

  const handleDeleteActionSelect = useCallback((event: Event) => {
    event.preventDefault();
    setActionsMenuOpen(false);
    requestAnimationFrame(() => {
      setDeleteDialogOpen(true);
    });
  }, []);

  const isFromRandomizer =
    navigationState?.from === 'randomizer' && Boolean(navigationState?.randomizerState);
  const randomizerHref = navigationState?.randomizerState?.shareUrl ?? '/randomizer';
  const backLabel = isFromRandomizer ? 'Back to Randomizer' : 'Back to Library';
  const dashboardContext = navigationState?.dashboardContext;

  const handleBackToDashboard = useCallback(() => {
    navigate('/dashboard', {
      state: dashboardContext ? { navigationContext: dashboardContext } : null,
    });
  }, [navigate, dashboardContext]);

  const timeline = buildTimeline(project);

  return (
    <div className="text-foreground">
      {/* Top bar: back link + edit + overflow */}
      <div className="bg-background/85 sticky top-0 z-20 flex items-center justify-between gap-4 px-4 py-3 backdrop-blur-md sm:px-6">
        {isFromRandomizer ? (
          <Button asChild variant="ghost" size="sm" className="gap-1.5 pointer-coarse:min-h-11">
            <Link to={randomizerHref}>
              <ChevronLeft className="size-4" />
              {backLabel}
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleBackToDashboard}
            variant="ghost"
            size="sm"
            className="gap-1.5"
          >
            <ChevronLeft className="size-4" />
            {backLabel}
          </Button>
        )}
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={navigateToEdit}
            disabled={isSubmitting}
            aria-label="Edit project"
            className="text-primary hover:bg-primary/10 hover:text-primary px-2.5 font-medium"
          >
            Edit
          </Button>
          <ProjectActionsMenu
            open={actionsMenuOpen}
            onOpenChange={setActionsMenuOpen}
            onArchive={onArchive}
            onDeleteSelect={handleDeleteActionSelect}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>

      {isMobile ? (
        // ─────── Mobile: single column, hero leads, inset details list
        <div className="pb-16">
          <div className="px-4 pt-5">
            <ProjectHeroImage project={project} />
          </div>

          <div className="px-5 pt-6">
            <ProjectTitleBlock project={project} />
          </div>

          <section className="px-5 pt-6">
            <SectionLabel>Details</SectionLabel>
            <ProjectDetails project={project} layout="list" onStatusChange={onStatusChange} />
          </section>

          <section className="px-5 pt-8">
            <SectionLabel>Timeline</SectionLabel>
            <VerticalTimeline
              timeline={timeline}
              projectId={project.id}
              status={project.status}
              editorState={dateEditorState}
              onEditorStateChange={setDateEditorState}
            />
          </section>

          <section className="group/notes px-5 pt-8">
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel className="m-0">Notes</SectionLabel>
            </div>
            <ProjectNotes
              notes={project.generalNotes || ''}
              sessionDraftKey={sessionDraftKeys.projectNotes(project.id)}
              accountId={user?.id}
              onSave={onUpdateNotes}
              readOnly={isSubmitting}
              variant="inline"
            />
          </section>

          <section className="px-5 pt-9">
            <ProjectProgressNotes project={project} key={project.id} />
          </section>
        </div>
      ) : (
        // ─────── Desktop: two-column with sticky sidebar
        <div className="mx-auto max-w-[1200px] px-7 pt-9 pb-20">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-8">
            <ProjectTitleBlock project={project} />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-14">
            {/* Main column */}
            <div className="min-w-0">
              <div className="mb-10">
                <ProjectHeroImage project={project} />
              </div>

              <section className="mb-[72px]">
                <SectionLabel>Timeline</SectionLabel>
                <HorizontalTimeline
                  timeline={timeline}
                  projectId={project.id}
                  status={project.status}
                  editorState={dateEditorState}
                  onEditorStateChange={setDateEditorState}
                />
              </section>

              <section className="group/notes mb-[72px]">
                <div className="mb-3 flex items-center justify-between">
                  <SectionLabel className="m-0">Notes</SectionLabel>
                </div>
                <ProjectNotes
                  notes={project.generalNotes || ''}
                  sessionDraftKey={sessionDraftKeys.projectNotes(project.id)}
                  accountId={user?.id}
                  onSave={onUpdateNotes}
                  readOnly={isSubmitting}
                  variant="inline"
                />
              </section>

              <section>
                <ProjectProgressNotes project={project} key={project.id} />
              </section>
            </div>

            {/* Sticky sidebar, meta only */}
            <aside className="sticky top-[80px] self-start">
              <SectionLabel>Details</SectionLabel>
              <ProjectDetails project={project} layout="dl" onStatusChange={onStatusChange} />
            </aside>
          </div>
        </div>
      )}

      <ProjectDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDelete={onDelete}
      />
    </div>
  );
};

export default ProjectDetailView;
