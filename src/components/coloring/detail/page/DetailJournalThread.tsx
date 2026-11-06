import React from 'react';
import { ProgressNote } from '@/types/project';
import DetailJournalEntry from './DetailJournalEntry';
import type { MarkdownString } from '@/types/markdown';

interface DetailJournalThreadProps {
  progressNotes: ProgressNote[];
  onUpdateProgressNote?: (noteId: string, content: MarkdownString) => Promise<void>;
  onDeleteProgressNote?: (noteId: string) => Promise<void>;
  onDeleteProgressNoteImage?: (noteId: string) => Promise<void>;
  disabled?: boolean;
}

const DetailJournalThread = React.memo(
  ({
    progressNotes,
    onUpdateProgressNote,
    onDeleteProgressNote,
    onDeleteProgressNoteImage,
    disabled = false,
  }: DetailJournalThreadProps) => {
    if (!progressNotes || progressNotes.length === 0) {
      return null;
    }

    return (
      <div className="border-primary/30 lg:before:border-primary/30 relative mt-8 ml-2 flex flex-col border-l border-dashed pl-6 lg:ml-0 lg:border-0 lg:pl-0 lg:before:absolute lg:before:top-3 lg:before:bottom-0 lg:before:left-[108px] lg:before:border-l lg:before:border-dashed">
        {progressNotes.map(note => (
          <DetailJournalEntry
            key={note.id}
            note={note}
            onUpdateNote={onUpdateProgressNote}
            onDeleteNote={onDeleteProgressNote}
            onDeleteImage={onDeleteProgressNoteImage}
            disabled={disabled}
          />
        ))}
      </div>
    );
  }
);

export default DetailJournalThread;
