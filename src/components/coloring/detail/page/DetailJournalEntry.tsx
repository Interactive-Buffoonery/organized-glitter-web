import React, { useState } from 'react';
import { createLogger } from '@/utils/logger';
import { ProgressNote } from '@/types/project';
import { formatLocalDate, parseTimestamp } from '@/utils/date/timezoneUtils';
import ImageGallery from '@/components/projects/ImageGallery';
import RichTextEditor from '@/components/notes/RichTextEditor.lazy';
import MarkdownContent from '@/components/notes/MarkdownContent';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/variants';
import { Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { MarkdownString } from '@/types/markdown';
import { cn } from '@/lib/utils';

const displayLogger = createLogger('DetailJournalEntry');

const TEXT_LINK_CLASSES =
  'inline-flex min-h-11 items-center text-foreground decoration-primary/50 hover:decoration-primary text-sm font-medium underline decoration-2 underline-offset-4 transition-colors focus-visible:ring-ring/50 focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-60 disabled:cursor-not-allowed';

interface DetailJournalEntryProps {
  note: ProgressNote;
  onUpdateNote?: (noteId: string, content: MarkdownString) => Promise<void>;
  onDeleteNote?: (noteId: string) => Promise<void>;
  onDeleteImage?: (noteId: string) => Promise<void>;
  disabled?: boolean;
}

const DetailJournalEntry = React.memo(
  ({
    note,
    onUpdateNote,
    onDeleteNote,
    onDeleteImage,
    disabled = false,
  }: DetailJournalEntryProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editableContent, setEditableContent] = useState(note.content);
    const [isSaving, setIsSaving] = useState(false);

    // Format the date (timezone-safe; see commit history for the YYYY-MM-DD parse rationale)
    const formattedDate = React.useMemo(() => {
      if (!note.date) return '';

      if (/^\d{4}-\d{2}-\d{2}$/.test(note.date)) {
        const [year, month, day] = note.date.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return formatLocalDate(date, 'MMMM d, yyyy');
      }

      const datetimeMatch = note.date.match(/^(\d{4}-\d{2}-\d{2})\s+00:00:00\.\d{3}Z?$/);
      if (datetimeMatch) {
        const dateOnly = datetimeMatch[1];
        const [year, month, day] = dateOnly.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return formatLocalDate(date, 'MMMM d, yyyy');
      }

      return formatLocalDate(parseTimestamp(note.date), 'MMMM d, yyyy');
    }, [note.date]);

    const imageUrl = note.imageUrl;

    const handleEdit = () => {
      setEditableContent(note.content);
      setIsEditing(true);
    };

    const handleCancel = () => {
      setIsEditing(false);
      setEditableContent(note.content);
    };

    const handleSave = async () => {
      if (!onUpdateNote) return;
      setIsSaving(true);
      try {
        await onUpdateNote(note.id, editableContent);
        setIsEditing(false);
      } catch (error) {
        displayLogger.error('Failed to update note:', error);
      } finally {
        setIsSaving(false);
      }
    };

    const handleDelete = async () => {
      if (!onDeleteNote) return;
      await onDeleteNote(note.id);
    };

    const handleDeleteImage = async () => {
      if (!onDeleteImage) return;
      await onDeleteImage(note.id);
    };

    const editorBody = isEditing ? (
      <div className="space-y-3">
        <RichTextEditor
          value={editableContent}
          onChange={setEditableContent}
          disabled={disabled}
          placeholder="Add a caption for your progress picture..."
          ariaLabel={`Edit progress note from ${formattedDate}`}
        />
        <div className="flex justify-end gap-5">
          <button
            type="button"
            onClick={handleCancel}
            disabled={disabled || isSaving}
            className={TEXT_LINK_CLASSES}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={disabled || isSaving}
            className={TEXT_LINK_CLASSES}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    ) : (
      <MarkdownContent content={note.content} />
    );

    const dateGutter = (
      <time
        dateTime={note.date.slice(0, 10)}
        className="font-handwritten mb-3 block text-3xl leading-tight lg:mb-0 lg:text-2xl"
      >
        {formattedDate.replace(/, \d{4}$/, '').replace(/^([A-Za-z]{3})[a-z]+/, '$1')}
        <span className="text-muted-foreground mt-1 block font-sans text-xs">
          {formattedDate.match(/\d{4}$/)?.[0]}
        </span>
      </time>
    );

    const imageBlock = imageUrl && (
      <div
        className={cn(
          'group/image relative mb-3.5 overflow-hidden rounded-xl',
          'lg:mb-0 lg:w-60 lg:shrink-0'
        )}
      >
        <ImageGallery
          imageUrl={imageUrl}
          alt={`Progress update from ${formattedDate}`}
          instagramStyle={true}
          size="large"
        />
        {onDeleteImage && (
          <div className="absolute top-2 right-2 opacity-0 transition-opacity group-focus-within/image:opacity-100 group-hover/image:opacity-100">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="glass-destructive"
                  size="touch"
                  disabled={disabled}
                  aria-label="Remove progress note image"
                >
                  <Trash2 className="mr-1 size-4" /> Remove image
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove image</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to remove this image? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteImage}
                    disabled={disabled}
                    className={buttonVariants({ variant: 'glass-destructive' })}
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    );

    const noteActions = !isEditing && (onUpdateNote || onDeleteNote) && (
      <div className="mt-2 flex items-center gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/entry:opacity-100 sm:focus-within:opacity-100">
        {onUpdateNote && (
          <button
            type="button"
            onClick={handleEdit}
            disabled={disabled}
            aria-label="Edit progress note"
            className="text-muted-foreground hover:bg-muted/60 hover:text-foreground grid size-11 place-items-center rounded-md transition-colors"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
        {onDeleteNote && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-label="Delete progress note"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive-text grid size-11 place-items-center rounded-md transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {imageUrl ? 'Delete progress picture' : 'Delete progress note'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this{' '}
                  {imageUrl ? 'progress picture' : 'progress note'} from {formattedDate}? This
                  action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={disabled}
                  className={buttonVariants({ variant: 'glass-destructive' })}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    );

    return (
      <article
        className={cn(
          'group/entry py-6 first:pt-0 last:pb-0',
          'before:border-primary before:bg-background before:absolute before:top-3 before:-left-[31px] before:size-3 before:rounded-full before:border-2 lg:before:left-[103px]',
          'relative lg:grid lg:grid-cols-[96px_minmax(0,1fr)] lg:items-start lg:gap-7'
        )}
      >
        {dateGutter}
        <div className="min-w-0">
          <div className={cn('lg:flex lg:items-start lg:gap-5')}>
            {imageBlock}
            <div className="text-foreground text-[15px] leading-[1.55] sm:text-base sm:leading-[1.6]">
              {editorBody}
            </div>
          </div>
          {noteActions}
        </div>
      </article>
    );
  }
);

export default DetailJournalEntry;
