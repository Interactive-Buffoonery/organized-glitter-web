import React, { useMemo, useState } from 'react';
import { SectionHeading } from '@/components/shared/Section';
import { createLogger } from '@/utils/logger';
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
import { Button } from '@/components/ui/button';
import ProgressNoteForm from './ProgressNoteForm';

import type { MarkdownString } from '@/types/markdown';
import { ProgressNoteDialog, type ProgressNoteDialogTarget } from './ProgressNoteDialog';

const logger = createLogger('ProjectProgressNotes');

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
      throw error;
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
  const showComposer = ['progress', 'onhold', 'completed'].includes(project.status);

  return (
    <section>
      <div className="mb-4">
        <SectionHeading>
          Progress{' '}
          <span className="text-muted-foreground font-normal">
            · {progressNotes.length} {progressNotes.length === 1 ? 'entry' : 'entries'}
          </span>
        </SectionHeading>
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
      ) : error && progressNotes.length === 0 ? (
        <div className="text-destructive-text py-8 text-center">
          <p>Error loading progress notes. Please try again.</p>
        </div>
      ) : (
        <div>
          {showComposer ? (
            <ProgressNoteForm
              onSubmit={handleAddNote}
              disabled={addProgressNoteMutation.isPending}
              variant="composer"
            />
          ) : (
            <Button
              type="button"
              variant="link"
              className="min-h-11 px-0"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="size-4" />
              Log progress
            </Button>
          )}
          {isEmpty && (
            <p className="text-muted-foreground mt-4 text-sm">
              Photos and notes you log will show up here.
            </p>
          )}

          {!isEmpty && (
            <ProgressNotesList
              journal
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
