import { useCallback } from 'react';

import { useAddColoringPageProgressNoteMutation } from '@/hooks/mutations/coloring/useColoringPageProgressNotes';
import { useAddProgressNoteMutation } from '@/hooks/mutations/useProjectDetailMutations';
import type { NoteTarget } from '@/services/pocketbase/overview.service';
import type { MarkdownString } from '@/types/markdown';

export interface AddNoteData {
  date: string;
  content: MarkdownString;
  imageFile?: File;
}

export type NoteTargetRef = Pick<NoteTarget, 'kind' | 'id'>;

export function useAddNoteFlow() {
  const addDiamondNote = useAddProgressNoteMutation();
  const addColoringNote = useAddColoringPageProgressNoteMutation();
  const { mutateAsync: addDiamondNoteAsync } = addDiamondNote;
  const { mutateAsync: addColoringNoteAsync } = addColoringNote;

  const submitNote = useCallback(
    async (target: NoteTargetRef, noteData: AddNoteData) => {
      if (target.kind === 'diamond-project') {
        await addDiamondNoteAsync({ projectId: target.id, noteData });
        return;
      }

      await addColoringNoteAsync({ pageId: target.id, noteData });
    },
    [addColoringNoteAsync, addDiamondNoteAsync]
  );

  return {
    submitNote,
    isSubmitting: addDiamondNote.isPending || addColoringNote.isPending,
  };
}
