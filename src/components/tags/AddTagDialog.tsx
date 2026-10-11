import React, { useRef, useState } from 'react';
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
import { Loader2, Plus } from 'lucide-react';

import { useCreateTag } from '@/hooks/mutations/useCreateTag';
import FormField from '@/components/projects/form/FormField';
import { TagNameField } from './TagNameField';
import { TAG_NAME_MAX_LENGTH, validateTagName } from './tagNameValidation';
import { ColorPicker, TAG_COLORS } from './ColorPicker';

interface AddTagDialogProps {
  onTagAdded?: () => void;
}

const AddTagDialog = ({ onTagAdded }: AddTagDialogProps) => {
  const [newTagName, setNewTagName] = useState('');
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameError =
    hasSubmitted || newTagName.trim().length > TAG_NAME_MAX_LENGTH
      ? validateTagName(newTagName)
      : undefined;
  const createTagMutation = useCreateTag();
  const isSubmitting = createTagMutation.isPending;

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();

    setHasSubmitted(true);
    if (validateTagName(newTagName)) {
      requestAnimationFrame(() => nameInputRef.current?.focus());
      return;
    }

    createTagMutation.mutate(
      { name: newTagName.trim(), color: selectedColor },
      {
        onSuccess: () => {
          setHasSubmitted(false);
          setNewTagName('');
          setSelectedColor(TAG_COLORS[0]);
          setIsDialogOpen(false);
          onTagAdded?.();
        },
      }
    );
  };

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={open => {
        setHasSubmitted(false);
        setIsDialogOpen(open);
      }}
    >
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

        <form noValidate onSubmit={handleAddTag}>
          <div className="space-y-4 py-4">
            <TagNameField
              ref={nameInputRef}
              value={newTagName}
              onChange={setNewTagName}
              disabled={isSubmitting}
              error={nameError}
            />

            <FormField id="tag-color" label="Color">
              <ColorPicker
                value={selectedColor}
                onChange={setSelectedColor}
                disabled={isSubmitting}
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
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
