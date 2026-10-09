import React, { useMemo, useState } from 'react';
import { logger } from '@/utils/logger';
import {
  useAddProgressNoteMutation,
  useDeleteProgressNoteImageMutation,
  useDeleteProgressNoteMutation,
  useUpdateProgressNoteMutation,
} from '@/hooks/mutations/useProjectDetailMutations';
import { useProgressNotesQuery } from '@/hooks/queries/useProgressNotes';
import { ProjectType } from '@/types/project';
import ProgressNotesList from './timeline/ProgressNotesList';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MarkdownString } from '@/types/markdown';
import { ProgressNoteDialog, type ProgressNoteDialogTarget } from './ProgressNoteDialog';

interface ProjectProgressNotesProps {
  project: ProjectType;
}

const PROGRESS_NOTE_SKELETON_KEYS = ['first', 'second', 'third'];

const ProjectProgressNotes: React.FC<ProjectProgressNotesProps> = ({ project }) => {
  const { data: progressNotes = [], isLoading, error } = useProgressNotesQuery(project?.id || null);
  const addProgressNoteMutation = useAddProgressNoteMutation();
  const updateProgressNoteMutation = useUpdateProgressNoteMutation();
  const deleteProgressNoteMutation = useDeleteProgressNoteMutation();
  const deleteProgressNoteImageMutation = useDeleteProgressNoteImageMutation();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const target = useMemo<ProgressNoteDialogTarget>(() => {
    const detail = [project.company, project.artist].filter(Boolean).join(' · ');

    return {
      kind: 'diamond-project',
      title: project.title,
      subtitle: detail ? `Diamond painting · ${detail}` : 'Diamond painting',
      thumbnailUrl: project.imageUrl ?? null,
    };
  }, [project.artist, project.company, project.imageUrl, project.title]);

  const handleAddNote = async (noteData: {
    date: string;
    content: MarkdownString;
    imageFile?: File;
  }) => {
    if (!project?.id) return false;

    try {
      await addProgressNoteMutation.mutateAsync({
        projectId: project.id,
        noteData,
      });
      setAddDialogOpen(false);
      return true;
    } catch (error) {
      logger.error('Error adding progress note:', error);
      return false;
    }
  };

  const handleUpdateNote = async (noteId: string, content: MarkdownString) => {
    if (!project?.id) return;

    try {
      await updateProgressNoteMutation.mutateAsync({
        noteId,
        projectId: project.id,
        content,
      });
    } catch (error) {
      logger.error('Error updating progress note:', error);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!project?.id) return;

    try {
      await deleteProgressNoteMutation.mutateAsync({ noteId, projectId: project.id });
    } catch (error) {
      logger.error('Error deleting progress note:', error);
    }
  };

  const handleDeleteNoteImage = async (noteId: string) => {
    if (!project?.id) return;

    try {
      await deleteProgressNoteImageMutation.mutateAsync({ noteId, projectId: project.id });
    } catch (error) {
      logger.error('Error deleting progress note image:', error);
    }
  };

  const isEmpty = !isLoading && !error && progressNotes.length === 0;
  const addRowLabel = isEmpty ? 'Add your first progress note.' : 'Add a progress note.';

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-primary m-0 inline-flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.14em] uppercase">
          <span
            aria-hidden="true"
            className="bg-primary inline-block h-[2px] w-[22px] rounded-sm"
          />
          Progress
        </h2>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {PROGRESS_NOTE_SKELETON_KEYS.map(key => (
            <div key={key} className="flex gap-x-4">
              <Skeleton className="size-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-3 w-[100px]" />
              </div>
            </div>
          ))}
        </div>
      ) : error && isEmpty ? (
        <div className="text-destructive-text py-8 text-center">
          <p>Error loading progress notes. Please try again.</p>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setAddDialogOpen(true)}
            className={cn(
              'group/add w-full text-left',
              'rounded-md py-6 first:pt-0 sm:py-8',
              'sm:grid sm:grid-cols-[88px_minmax(0,1fr)] sm:items-start sm:gap-6',
              'focus-visible:ring-primary/40 focus-visible:ring-2 focus-visible:outline-none'
            )}
          >
            <span
              aria-hidden="true"
              className="border-border/70 text-muted-foreground/60 group-hover/add:border-primary/60 group-hover/add:text-primary hidden size-12 items-center justify-center rounded-full border border-dashed transition-colors sm:flex"
            >
              <Plus className="size-5" />
            </span>
            <span
              className={cn(
                'flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm',
                'border-border/70 text-muted-foreground transition-colors',
                'group-hover/add:border-primary/50 group-hover/add:text-foreground group-hover/add:bg-primary/5'
              )}
            >
              <Plus className="size-4 sm:hidden" />
              {addRowLabel}
            </span>
          </button>

          {!isEmpty && (
            <ProgressNotesList
              progressNotes={progressNotes}
              onUpdateProgressNote={handleUpdateNote}
              onDeleteProgressNote={handleDeleteNote}
              onDeleteProgressNoteImage={handleDeleteNoteImage}
              disabled={
                updateProgressNoteMutation.isPending ||
                deleteProgressNoteMutation.isPending ||
                deleteProgressNoteImageMutation.isPending
              }
            />
          )}
        </div>
      )}

      <ProgressNoteDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSubmit={handleAddNote}
        disabled={addProgressNoteMutation.isPending}
        target={target}
      />
    </section>
  );
};

export default ProjectProgressNotes;
