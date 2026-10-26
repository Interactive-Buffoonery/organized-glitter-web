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
import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectType, ProjectStatus, ProgressNote } from '@/types/project';
import type { DashboardFilterContext } from '@/hooks/mutations/useSaveNavigationContext';
import ImageGallery from '@/components/projects/ImageGallery';
import ProjectCoverImageEditor from '@/components/projects/ProjectCoverImageEditor';
import { ProjectByline } from './ProjectDetailFacts';
import { ProjectStatusSummary, ProjectKitAbout, ProjectKitTags } from './ProjectKitSummary';
import { SectionHeading } from '@/components/shared/Section';
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
        className="text-muted-foreground hover:text-foreground min-h-11 min-w-11"
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
  <div className="relative w-full">
    {project.imageUrl ? (
      <>
        <div className="overflow-hidden sm:rounded-2xl">
          <ImageGallery
            imageUrl={project.imageUrl}
            alt={project.title}
            previewFit="cover"
            size="full"
          />
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
    <ProjectByline project={project} />
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

  const note = (
    <section className="group/notes border-border/60 border-t pt-6">
      <SectionHeading className="mb-3">Note</SectionHeading>
      <ProjectNotes
        notes={project.generalNotes || ''}
        sessionDraftKey={sessionDraftKeys.projectNotes(project.id)}
        accountId={user?.id}
        onSave={onUpdateNotes}
        readOnly={isSubmitting}
        variant="pinned"
        emptyPlaceholder="Keep a note about this kit."
      />
    </section>
  );

  return (
    <div className="text-foreground">
      {/* Top bar: back link + edit + overflow */}
      <div className="bg-background/85 sticky top-0 z-20 backdrop-blur-md">
        <div
          className={cn(
            'mx-auto flex items-center justify-between gap-4 py-3',
            isMobile ? 'px-4' : 'max-w-[1200px] px-7'
          )}
        >
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
              className="min-h-11 gap-1.5"
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
              className="text-primary hover:bg-primary/10 hover:text-primary min-h-11 px-2.5 font-medium"
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
      </div>

      {isMobile ? (
        <div className="pb-16">
          <ProjectHeroImage project={project} />
          <div className="space-y-6 px-5 pt-6">
            <ProjectTitleBlock project={project} />
            <ProjectStatusSummary
              key={project.id}
              project={project}
              onStatusChange={onStatusChange}
              disabled={isSubmitting}
            />
            <ProjectKitTags project={project} />
            <ProjectKitAbout project={project} />
            {note}
            <ProjectProgressNotes project={project} key={project.id} />
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-[1200px] px-7 pt-9 pb-20">
          <header className="border-border/60 mb-6 border-b pb-6">
            <ProjectTitleBlock project={project} />
          </header>
          <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-14">
            <div className="min-w-0">
              <div className="mb-8">
                <ProjectHeroImage project={project} />
              </div>
              <ProjectProgressNotes project={project} key={project.id} />
            </div>
            <aside className="sticky top-[80px] space-y-6 self-start">
              <ProjectStatusSummary
                key={project.id}
                project={project}
                onStatusChange={onStatusChange}
                disabled={isSubmitting}
              />
              {note}
              <ProjectKitAbout project={project} />
              <ProjectKitTags project={project} />
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
