import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface RandomizerNoteDialogProps {
  defaultContent: string;
  triggerLabel?: string;
  title?: string;
  description?: string;
  textareaLabel?: string;
  isSaving?: boolean;
  onSave: (content: string) => Promise<void>;
}

export function RandomizerNoteDialog({
  defaultContent,
  triggerLabel = 'Save page note',
  title = 'Save page note',
  description = 'Add an optional note to the selected coloring page.',
  textareaLabel = 'Page note',
  isSaving = false,
  onSave,
}: RandomizerNoteDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState(defaultContent);

  useEffect(() => {
    if (isOpen) {
      setContent(defaultContent);
    }
  }, [defaultContent, isOpen]);

  const handleSave = async () => {
    if (!content.trim()) return;
    await onSave(content);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="glass" size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent layout="keyboard-safe">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>

        <Textarea
          value={content}
          onChange={event => setContent(event.target.value)}
          aria-label={textareaLabel}
          rows={6}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!content.trim() || isSaving} onClick={handleSave}>
            {isSaving ? 'Saving...' : 'Save note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
