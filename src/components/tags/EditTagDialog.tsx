import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Pencil } from 'lucide-react';
import FormField from '@/components/projects/form/FormField';
import type { Tag } from '@/types/tag';
import { ColorPicker } from './ColorPicker';
import { useUpdateTag } from '@/hooks/mutations/useUpdateTag';
import { logger } from '@/utils/logger';

interface EditTagDialogProps {
  tag: Tag;
}

/**
 * Error Handling Strategy:
 *
 * This component implements a two-level error handling approach:
 *
 * 1. Global Error Handling (useUpdateTag hook):
 *    - Provides comprehensive error categorization and user-friendly toast notifications
 *    - Handles authentication errors, duplicate name errors, and general failures
 *    - Automatically invalidates relevant queries on success
 *
 * 2. Component-Level Error Handling (onError callback):
 *    - Provides immediate UI feedback by keeping the dialog open for retry
 *    - Logs component-specific error context for debugging
 *    - Works alongside global handling to ensure users can recover from errors
 *
 * This ensures users receive both immediate feedback (toast notifications) and
 * appropriate UI state management (dialog remains open for retry on errors).
 */

const EditTagDialog = ({ tag }: EditTagDialogProps) => {
  const [tagName, setTagName] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const updateTagMutation = useUpdateTag();

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setTagName(tag.name);
      setSelectedColor(tag.color);
    }
    setIsDialogOpen(open);
  };

  const handleUpdateTag = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tagName.trim()) {
      return;
    }

    // Check character limit (100 characters max as per database constraint)
    if (tagName.trim().length > 100) {
      return;
    }

    updateTagMutation.mutate(
      {
        id: tag.id,
        updates: {
          name: tagName.trim(),
          color: selectedColor,
        },
      },
      {
        onSuccess: () => {
          setIsDialogOpen(false);
          // Global success toast notification is handled by useUpdateTag hook.
        },
        onError: (error: unknown) => {
          // Component-level error handling for immediate user feedback
          // This works alongside the global error handling in useUpdateTag hook
          logger.error('EditTagDialog: Failed to update tag:', { error });

          // Keep dialog open so user can retry
          // Global error toast is already shown by useUpdateTag hook, but we ensure
          // the user can immediately see the form is still available for retry
          const errorMessage =
            error instanceof Error ? error.message : 'An unexpected error occurred';

          // Show additional inline feedback if needed for specific validation errors
          if (errorMessage.includes('name already exists')) {
            // The global toast will handle the notification, but we keep the dialog open
            // so the user can modify the tag name and try again
            return;
          }

          // For other errors, the global toast notification from useUpdateTag provides feedback
          // Dialog remains open for user to retry or cancel
        },
      }
    );
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-primary hover:bg-primary/10 hover:text-primary"
        >
          <Pencil className="size-4" />
          <span className="sr-only">Edit</span>
        </Button>
      </DialogTrigger>
      <DialogContent layout="keyboard-safe">
        <DialogHeader>
          <DialogTitle>Edit Tag</DialogTitle>
          <DialogDescription>Update the name and color of this tag.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleUpdateTag}>
          <div className="space-y-4 py-4">
            <FormField id="edit-tag-name" label="Tag Name" required={true}>
              <div className="relative">
                <Input
                  id="edit-tag-name"
                  placeholder="Enter tag name"
                  value={tagName}
                  onChange={e => setTagName(e.target.value)}
                  disabled={updateTagMutation.isPending}
                  className={tagName.length > 100 ? 'border-destructive' : ''}
                />
                {/* Character count indicator */}
                {tagName.length > 0 && (
                  <div
                    className={`absolute top-1/2 right-2 -translate-y-1/2 transform text-xs ${
                      tagName.length > 100 ? 'text-destructive-text' : 'text-muted-foreground'
                    }`}
                  >
                    {tagName.length}/100
                  </div>
                )}
              </div>
              {tagName.length > 100 && (
                <p className="text-destructive-text mt-1 text-xs">
                  Tag name must be 100 characters or less
                </p>
              )}
            </FormField>

            <FormField id="edit-tag-color" label="Color">
              <ColorPicker
                value={selectedColor}
                onChange={setSelectedColor}
                disabled={updateTagMutation.isPending}
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={updateTagMutation.isPending || tagName.length > 100}>
              {updateTagMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Update Tag
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditTagDialog;
