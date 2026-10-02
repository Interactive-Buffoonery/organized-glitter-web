import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { Gem, Palette, type LucideIcon } from 'lucide-react';

import ProgressNoteForm from '@/components/projects/ProgressNoteForm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { MarkdownString } from '@/types/markdown';

type ProgressNoteDialogTargetKind = 'diamond-project' | 'coloring-page';

export interface ProgressNoteDialogTarget {
  kind: ProgressNoteDialogTargetKind;
  title: string;
  subtitle?: string;
  thumbnailUrl?: string | null;
}

interface ProgressNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (noteData: {
    date: string;
    content: MarkdownString;
    imageFile?: File;
  }) => Promise<boolean>;
  disabled?: boolean;
  target?: ProgressNoteDialogTarget;
}

const TARGET_KIND_ICONS: Record<ProgressNoteDialogTargetKind, LucideIcon> = {
  'diamond-project': Gem,
  'coloring-page': Palette,
};

function ProgressNoteTargetThumbnail({ target }: { target: ProgressNoteDialogTarget }) {
  if (target.thumbnailUrl) {
    return (
      <PrivateFileImage
        src={target.thumbnailUrl}
        alt=""
        className="size-12 shrink-0 rounded-lg object-cover"
        loading="lazy"
        decoding="async"
      />
    );
  }

  const CraftIcon = TARGET_KIND_ICONS[target.kind];

  return (
    <span
      data-testid={`progress-note-target-${target.kind}-fallback`}
      aria-hidden="true"
      className="bg-muted text-muted-foreground border-border/60 flex size-12 shrink-0 items-center justify-center rounded-lg border"
    >
      <CraftIcon aria-hidden="true" className="size-5" />
    </span>
  );
}

function ProgressNoteTargetHeader({ target }: { target: ProgressNoteDialogTarget }) {
  return (
    <DialogHeader className="shrink-0 px-6 pt-6 pr-14 pb-4 text-left">
      <div className="flex min-w-0 items-start gap-3">
        <ProgressNoteTargetThumbnail target={target} />
        <div className="min-w-0 flex-1 space-y-1">
          <DialogTitle className="line-clamp-2 min-w-0 text-lg leading-snug font-semibold tracking-normal">
            <span className="sr-only">Add progress note to </span>
            {target.title}
          </DialogTitle>
          {target.subtitle ? (
            <p className="text-muted-foreground line-clamp-1 text-sm">{target.subtitle}</p>
          ) : null}
        </div>
      </div>
      <DialogDescription className="sr-only">
        Add a date, optional progress photo, and optional caption.
      </DialogDescription>
    </DialogHeader>
  );
}

export function ProgressNoteDialog({
  open,
  onOpenChange,
  onSubmit,
  disabled = false,
  target,
}: ProgressNoteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        motion="fade"
        layout="keyboard-safe-sheet"
        className="progress-note-dialog-content border-border bg-card text-card-foreground flex flex-col overflow-hidden p-0 shadow-xl"
      >
        {target ? (
          <ProgressNoteTargetHeader target={target} />
        ) : (
          <DialogHeader className="shrink-0 px-6 pt-6 pr-14 pb-4 text-left">
            <DialogTitle className="font-handwritten text-2xl tracking-tight">
              Add a progress note
            </DialogTitle>
            <DialogDescription className="sr-only">
              Add a date, optional progress photo, and optional caption.
            </DialogDescription>
          </DialogHeader>
        )}
        <ProgressNoteForm onSubmit={onSubmit} disabled={disabled} variant="dialog-sheet" />
      </DialogContent>
    </Dialog>
  );
}
