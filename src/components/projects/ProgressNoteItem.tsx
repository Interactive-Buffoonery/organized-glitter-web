import React, { useState } from 'react';
import { logger, createLogger } from '@/utils/logger';
import { ProgressNote } from '@/types/project';
import { formatLocalDate, parseTimestamp } from '@/utils/date/timezoneUtils';
import ImageGallery from './ImageGallery';
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

const displayLogger = createLogger('ProgressNoteItem');

const TEXT_LINK_CLASSES =
  'text-foreground decoration-primary/50 hover:decoration-primary text-sm font-medium underline decoration-2 underline-offset-4 transition-colors focus-visible:ring-ring/50 focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-60 disabled:cursor-not-allowed';

interface ProgressNoteItemProps {
  note: ProgressNote;
  onUpdateNote?: (noteId: string, content: MarkdownString) => Promise<void>;
  onDeleteNote?: (noteId: string) => Promise<void>;
  onDeleteImage?: (noteId: string) => Promise<void>;
  disabled?: boolean;
}

const ProgressNoteItem = React.memo(
  ({
    note,
    onUpdateNote,
    onDeleteNote,
    onDeleteImage,
    disabled = false,
  }: ProgressNoteItemProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editableContent, setEditableContent] = useState(note.content);
    const [isSaving, setIsSaving] = useState(false);

    // Format the date (timezone-safe; see commit history for the YYYY-MM-DD parse rationale)
    const formattedDate = React.useMemo(() => {
      if (!note.date) return '';

      displayLogger.debug('🗓️ Progress note date display formatting', {
        noteId: note.id,
        originalDate: note.date,
        dateType: typeof note.date,
        dateLength: note.date.length,
      });

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
    }, [note.date, note.id]);

    // Split formatted date into parts for the journal layout's gutter
    const dateParts = React.useMemo(() => {
      // formattedDate looks like "April 26, 2026"
      const match = formattedDate.match(/^(\w+)\s+(\d+),\s+(\d+)$/);
      if (!match) return null;
      return { month: match[1], day: match[2], year: match[3] };
    }, [formattedDate]);

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
        logger.error('Failed to update note:', error);
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

    const dateGutter = dateParts && (
      <>
        {/* Mobile: handwritten "Month Day" + small year + uppercase label, two-line */}
        <div className="mb-4 flex items-baseline gap-3 sm:hidden">
          <div className="flex items-baseline gap-1.5">
            <span className="font-handwritten text-foreground text-3xl leading-none font-semibold">
              {dateParts.month} {dateParts.day}
            </span>
            <span className="text-muted-foreground/70 text-xs">{dateParts.year}</span>
          </div>
        </div>
        {/* Desktop: 88px gutter on the left */}
        <div className="hidden pt-1 sm:block">
          <div className="font-handwritten text-foreground/90 text-[40px] leading-none font-bold">
            {dateParts.day}
          </div>
          <div className="text-muted-foreground mt-1.5 text-xs font-semibold tracking-[0.08em] uppercase">
            {dateParts.month}
          </div>
          <div className="text-muted-foreground/60 mt-0.5 text-xs">{dateParts.year}</div>
        </div>
      </>
    );

    const imageBlock = imageUrl && (
      <div className="group/image relative mb-3.5 overflow-hidden rounded-xl">
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
                  variant="glass-destructive"
                  size="sm"
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
            className="text-muted-foreground hover:bg-muted/60 hover:text-foreground grid size-7 place-items-center rounded-md transition-colors"
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
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive-text grid size-7 place-items-center rounded-md transition-colors"
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
          'group/entry py-8 first:pt-0 last:pb-0 sm:py-10',
          'sm:grid sm:grid-cols-[88px_minmax(0,1fr)] sm:items-start sm:gap-6'
        )}
      >
        {dateGutter}
        <div className="min-w-0">
          {imageBlock}
          <div className="text-foreground text-[15px] leading-[1.55] sm:text-base sm:leading-[1.6]">
            {editorBody}
          </div>
          {noteActions}
        </div>
      </article>
    );
  }
);

export default ProgressNoteItem;
