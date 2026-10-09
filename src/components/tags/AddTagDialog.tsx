import { notify } from '@/lib/notifications';
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
import { Loader2, Plus } from 'lucide-react';

import { useCreateTag } from '@/hooks/mutations/useCreateTag';
import FormField from '@/components/projects/form/FormField';
import { ColorPicker, TAG_COLORS } from './ColorPicker';

interface AddTagDialogProps {
  onTagAdded?: () => void;
}

const AddTagDialog = ({ onTagAdded }: AddTagDialogProps) => {
  const [newTagName, setNewTagName] = useState('');
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const createTagMutation = useCreateTag();
  const isSubmitting = createTagMutation.isPending;

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newTagName.trim()) {
      notify({
        kind: 'error',
        title: 'Tag name required',
        description: 'Tag name cannot be empty',
      });
      return;
    }

    // Check character limit (100 characters max as per database constraint)
    if (newTagName.trim().length > 100) {
      notify({
        kind: 'error',
        title: 'Tag name too long',
        description: 'Tag names must be 100 characters or less.',
      });
      return;
    }

    createTagMutation.mutate(
      { name: newTagName.trim(), color: selectedColor },
      {
        onSuccess: () => {
          setNewTagName('');
          setSelectedColor(TAG_COLORS[0]);
          setIsDialogOpen(false);
          onTagAdded?.();
        },
      }
    );
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="glass">
          <Plus className="mr-2 size-4" />
          Add tag
        </Button>
      </DialogTrigger>
      <DialogContent layout="keyboard-safe">
        <DialogHeader>
          <DialogTitle>Add tag</DialogTitle>
          <DialogDescription>
            Create a new tag to organize your diamond projects. Coloring tags are created from
            coloring book forms.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleAddTag}>
          <div className="space-y-4 py-4">
            <FormField id="tag-name" label="Tag Name" required={true}>
              <div className="relative">
                <Input
                  id="tag-name"
                  placeholder="Enter tag name"
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  disabled={isSubmitting}
                  className={newTagName.length > 100 ? 'border-destructive' : ''}
                />

                {/* Character count indicator */}
                {newTagName.length > 0 && (
                  <div
                    className={`absolute top-1/2 right-2 -translate-y-1/2 transform text-xs ${
                      newTagName.length > 100 ? 'text-destructive-text' : 'text-muted-foreground'
                    }`}
                  >
                    {newTagName.length}/100
                  </div>
                )}
              </div>
              {newTagName.length > 100 && (
                <p className="text-destructive-text mt-1 text-xs">
                  Tag name must be 100 characters or less
                </p>
              )}
            </FormField>

            <FormField id="tag-color" label="Color">
              <ColorPicker
                value={selectedColor}
                onChange={setSelectedColor}
                disabled={isSubmitting}
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || newTagName.length > 100}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Add tag
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddTagDialog;
