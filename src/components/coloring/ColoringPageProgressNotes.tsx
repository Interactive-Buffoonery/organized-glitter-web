import { useMemo } from 'react';
import { SectionHeading } from '@/components/shared/Section';

import DetailJournalThread from './detail/page/DetailJournalThread';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAddColoringPageProgressNoteMutation,
  useDeleteColoringPageProgressNoteImageMutation,
  useDeleteColoringPageProgressNoteMutation,
  useUpdateColoringPageProgressNoteMutation,
} from '@/hooks/mutations/coloring/useColoringPageProgressNotes';
import { useColoringPageProgressNotes } from '@/hooks/queries/coloring/useColoringPageProgressNotes';
import { ProgressNoteComposer } from './detail/page/ProgressNoteComposer';
import type { MarkdownString } from '@/types/markdown';
import type { ProgressNote } from '@/types/project';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ColoringPageProgressNotes');
const COLORING_PROGRESS_NOTE_SKELETON_KEYS = ['first', 'second', 'third'];

interface ColoringPageProgressNotesProps {
  pageId: string;
}

export function ColoringPageProgressNotes({ pageId }: ColoringPageProgressNotesProps) {
  const { data: pageNotes = [], isLoading, error } = useColoringPageProgressNotes(pageId);
  const addNote = useAddColoringPageProgressNoteMutation();
  const updateNote = useUpdateColoringPageProgressNoteMutation();
  const deleteNote = useDeleteColoringPageProgressNoteMutation();
  const deleteNoteImage = useDeleteColoringPageProgressNoteImageMutation();

  const progressNotes = useMemo<ProgressNote[]>(
    () =>
      pageNotes.map(note => ({
        id: note.id,
        projectId: note.pageId,
        content: note.content,
        date: note.date,
        imageUrl: note.imageUrl,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      })),
    [pageNotes]
  );

  const handleAddNote = async (noteData: {
    date: string;
    content: MarkdownString;
    imageFile?: File;
  }) => {
    try {
      await addNote.mutateAsync({ pageId, noteData });
      return true;
    } catch (error) {
      logger.error('Error adding coloring page progress note:', error);
      return false;
    }
  };

  const handleUpdateNote = async (noteId: string, content: MarkdownString) => {
    try {
      await updateNote.mutateAsync({ noteId, pageId, content });
    } catch (error) {
      logger.error('Error updating coloring page progress note:', error);
      throw error;
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNote.mutateAsync({ noteId, pageId });
    } catch (error) {
      logger.error('Error deleting coloring page progress note:', error);
    }
  };

  const handleDeleteNoteImage = async (noteId: string) => {
    try {
      await deleteNoteImage.mutateAsync({ noteId, pageId });
    } catch (error) {
      logger.error('Error deleting coloring page progress note image:', error);
    }
  };

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
          {COLORING_PROGRESS_NOTE_SKELETON_KEYS.map(key => (
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
          <ProgressNoteComposer onSubmit={handleAddNote} disabled={addNote.isPending} />
          {progressNotes.length === 0 && (
            <p className="text-muted-foreground mt-6 text-sm">
              Photos and notes you log will show up here.
            </p>
          )}
          {progressNotes.length > 0 && (
            <DetailJournalThread
              progressNotes={progressNotes}
              onUpdateProgressNote={handleUpdateNote}
              onDeleteProgressNote={handleDeleteNote}
              onDeleteProgressNoteImage={handleDeleteNoteImage}
              disabled={updateNote.isPending || deleteNote.isPending || deleteNoteImage.isPending}
            />
          )}
        </div>
      )}
    </section>
  );
}
