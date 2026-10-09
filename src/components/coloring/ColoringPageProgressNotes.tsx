import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

import {
  ProgressNoteDialog,
  type ProgressNoteDialogTarget,
} from '@/components/projects/ProgressNoteDialog';
import ProgressNotesList from '@/components/projects/timeline/ProgressNotesList';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAddColoringPageProgressNoteMutation,
  useDeleteColoringPageProgressNoteImageMutation,
  useDeleteColoringPageProgressNoteMutation,
  useUpdateColoringPageProgressNoteMutation,
} from '@/hooks/mutations/coloring/useColoringPageProgressNotes';
import { useColoringPageProgressNotes } from '@/hooks/queries/coloring/useColoringPageProgressNotes';
import { cn } from '@/lib/utils';
import type { MarkdownString } from '@/types/markdown';
import type { ProgressNote } from '@/types/project';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ColoringPageProgressNotes');
const COLORING_PROGRESS_NOTE_SKELETON_KEYS = ['first', 'second', 'third'];

interface ColoringPageProgressNotesProps {
  pageId: string;
  target?: ProgressNoteDialogTarget;
}

export function ColoringPageProgressNotes({ pageId, target }: ColoringPageProgressNotesProps) {
  const { data: pageNotes = [], isLoading, error } = useColoringPageProgressNotes(pageId);
  const addNote = useAddColoringPageProgressNoteMutation();
  const updateNote = useUpdateColoringPageProgressNoteMutation();
  const deleteNote = useDeleteColoringPageProgressNoteMutation();
  const deleteNoteImage = useDeleteColoringPageProgressNoteImageMutation();
  const [addDialogOpen, setAddDialogOpen] = useState(false);

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
      setAddDialogOpen(false);
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
              disabled={updateNote.isPending || deleteNote.isPending || deleteNoteImage.isPending}
            />
          )}
        </div>
      )}

      <ProgressNoteDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSubmit={handleAddNote}
        disabled={addNote.isPending}
        target={target}
      />
    </section>
  );
}
