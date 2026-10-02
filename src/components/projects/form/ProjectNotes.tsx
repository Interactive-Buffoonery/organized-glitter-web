import { useState } from 'react';
import { logger } from '@/utils/logger';
import FormField from './FormField';
import { Pencil } from 'lucide-react';
import RichTextEditor from '@/components/notes/RichTextEditor.lazy';
import MarkdownContent from '@/components/notes/MarkdownContent';
import type { MarkdownString } from '@/types/markdown';
import { useSessionDraft } from '@/hooks/useSessionDraft';

interface ProjectNotesProps {
  notes: MarkdownString;
  sessionDraftKey?: string;
  accountId?: string;
  onChange?: (notes: MarkdownString) => void;
  onSave?: (notes: MarkdownString) => Promise<void>;
  readOnly?: boolean;
  /**
   * `default`: keeps the original layout. Bottom-right "Edit" button next to
   *   the rendered markdown.
   * `inline`: minimal layout. Rendered markdown only, with a small hover-revealed
   *   pencil in the top-right corner. Parent must apply `group/notes` to
   *   scope the hover.
   */
  variant?: 'default' | 'inline';
  formLabel?: string;
  placeholder?: string;
  ariaLabel?: string;
  emptyPlaceholder?: string;
}

const getEmptyPlaceholder = (variant: 'default' | 'inline', emptyPlaceholder?: string) =>
  emptyPlaceholder ??
  (variant === 'inline'
    ? 'No notes yet. Click the pencil to add some thoughts.'
    : 'No notes added yet.');

const TEXT_LINK_CLASSES =
  'text-foreground decoration-primary/50 hover:decoration-primary text-sm font-medium underline decoration-2 underline-offset-4 transition-colors focus-visible:ring-ring/50 focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-60 disabled:cursor-not-allowed';

const ProjectNotes = ({
  notes,
  sessionDraftKey,
  accountId,
  onChange,
  onSave,
  readOnly = false,
  variant = 'default',
  formLabel = 'Notes About This Project',
  placeholder = 'Add any additional notes about this project...',
  ariaLabel = 'Project notes',
  emptyPlaceholder,
}: ProjectNotesProps) => {
  const restored = useSessionDraft<MarkdownString>(
    onChange ? undefined : sessionDraftKey,
    accountId,
    (): MarkdownString | undefined =>
      !onChange && isEditing && editableNotes !== notes ? editableNotes : undefined,
    draft => {
      setEditableNotes(draft);
      setIsEditing(true);
    }
  );
  const [restoredNotes] = useState(restored);
  const [isEditing, setIsEditing] = useState(restoredNotes !== undefined);
  const [editableNotes, setEditableNotes] = useState(restoredNotes ?? notes ?? '');
  const [isSaving, setIsSaving] = useState(false);

  // Form-mode (controlled by parent)
  if (onChange) {
    return (
      <FormField id="notes" label={formLabel}>
        <RichTextEditor
          value={notes}
          onChange={onChange}
          placeholder={placeholder}
          ariaLabel={ariaLabel}
        />
      </FormField>
    );
  }

  const handleEdit = () => {
    setEditableNotes(notes || '');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!onSave) return;

    setIsSaving(true);
    try {
      await onSave(editableNotes);
      setIsEditing(false);
    } catch (error) {
      logger.error('Failed to save notes:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (readOnly) {
    return (
      <div>
        {notes ? (
          <MarkdownContent content={notes} />
        ) : (
          <span className="text-muted-foreground italic">
            {getEmptyPlaceholder(variant, emptyPlaceholder)}
          </span>
        )}
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="space-y-3">
        <RichTextEditor
          value={editableNotes}
          onChange={setEditableNotes}
          placeholder={placeholder}
          disabled={isSaving}
          ariaLabel={ariaLabel}
        />
        <div className="flex justify-end gap-5">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSaving}
            className={TEXT_LINK_CLASSES}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={TEXT_LINK_CLASSES}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    // Pencil top-right. Hover-revealed when notes exist (markdown is the
    // primary content); always visible when empty (the affordance IS the
    // primary content, since the placeholder copy points at it).
    const hasNotes = !!notes;
    const emptyEditButtonClass =
      'text-muted-foreground hover:bg-muted/60 hover:text-foreground grid size-7 shrink-0 place-items-center rounded-md transition-colors pointer-coarse:size-11';

    if (!hasNotes) {
      return (
        <div className="flex items-start gap-2">
          <p className="text-muted-foreground/70 m-0 min-w-0 flex-1 italic">
            {getEmptyPlaceholder(variant, emptyPlaceholder)}
          </p>
          <button
            type="button"
            onClick={handleEdit}
            aria-label="Edit notes"
            className={emptyEditButtonClass}
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      );
    }

    return (
      <div className="relative">
        <button
          type="button"
          onClick={handleEdit}
          aria-label="Edit notes"
          className={
            hasNotes
              ? 'text-muted-foreground hover:bg-muted/60 hover:text-foreground absolute top-0 right-0 grid size-7 place-items-center rounded-md opacity-0 transition-opacity group-hover/notes:opacity-100 focus-visible:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground absolute top-0 right-0 grid size-7 place-items-center rounded-md transition-colors pointer-coarse:size-11'
          }
        >
          <Pencil className="size-3.5" />
        </button>
        <MarkdownContent content={notes} className="pr-10 pointer-coarse:pr-14" />
      </div>
    );
  }

  return (
    <div>
      {notes ? (
        <MarkdownContent content={notes} />
      ) : (
        <span className="text-muted-foreground italic">
          {getEmptyPlaceholder(variant, emptyPlaceholder)}
        </span>
      )}
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={handleEdit} className={TEXT_LINK_CLASSES}>
          Edit
        </button>
      </div>
    </div>
  );
};

export default ProjectNotes;
