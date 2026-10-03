import { useState } from 'react';
import { Plus } from 'lucide-react';

import { NoteTargetPicker } from '@/components/notes-feed/NoteTargetPicker';
import {
  ProgressNoteDialog,
  type ProgressNoteDialogTarget,
} from '@/components/projects/ProgressNoteDialog';
import { Button } from '@/components/ui/button';
import { useAddNoteFlow, type AddNoteData, type NoteTargetRef } from '@/hooks/useAddNoteFlow';
import type { VerticalToggles } from '@/services/pocketbase/dashboardSettings.service';

interface AddNoteCTAProps {
  visibleTab: 'all' | 'diamond' | 'coloring';
  sourceId: string;
  verticals?: VerticalToggles;
  target?: ProgressNoteDialogTarget;
}

export function AddNoteCTA({ visibleTab, sourceId, verticals, target }: AddNoteCTAProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [diamondDialogOpen, setDiamondDialogOpen] = useState(false);
  const { submitNote, isSubmitting } = useAddNoteFlow();

  const isScoped = sourceId !== 'all';
  const diamondDirect = visibleTab === 'diamond' && isScoped;
  const bookScoped = visibleTab === 'coloring' && isScoped;

  const openNoteComposer = () => {
    if (diamondDirect) {
      setDiamondDialogOpen(true);
      return;
    }

    setPickerOpen(true);
  };

  const handleDiamondSubmit = async (noteData: AddNoteData) => {
    const noteTarget: NoteTargetRef = { kind: 'diamond-project', id: sourceId };
    await submitNote(noteTarget, noteData);
    setDiamondDialogOpen(false);
    return true;
  };

  return (
    <>
      <Button type="button" size="sm" onClick={openNoteComposer}>
        <Plus aria-hidden="true" className="size-4" />
        Add a progress note
      </Button>

      {diamondDirect ? (
        <ProgressNoteDialog
          open={diamondDialogOpen}
          onOpenChange={setDiamondDialogOpen}
          onSubmit={handleDiamondSubmit}
          disabled={isSubmitting}
          target={target}
        />
      ) : (
        <NoteTargetPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          mode={bookScoped ? { kind: 'book', bookId: sourceId } : { kind: 'targets' }}
          verticals={verticals}
        />
      )}
    </>
  );
}
