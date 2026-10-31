import { JournalThread } from '@/components/shared/JournalThread';
import React from 'react';
import { ProgressNote } from '@/types/project';
import ProgressNoteItem from '../ProgressNoteItem';
import type { MarkdownString } from '@/types/markdown';

interface ProgressNotesListProps {
  progressNotes: ProgressNote[];
  onUpdateProgressNote?: (noteId: string, content: MarkdownString) => Promise<void>;
  onDeleteProgressNote?: (noteId: string) => Promise<void>;
  onDeleteProgressNoteImage?: (noteId: string) => Promise<void>;
  disabled?: boolean;
  journal?: boolean;
}

// Use React.memo to prevent unnecessary rerenders
const ProgressNotesList = React.memo(
  ({
    progressNotes,
    onUpdateProgressNote,
    onDeleteProgressNote,
    onDeleteProgressNoteImage,
    disabled = false,
    journal = false,
  }: ProgressNotesListProps) => {
    if (!progressNotes || progressNotes.length === 0) {
      return null;
    }

    const entries = progressNotes.map(note => (
      <ProgressNoteItem
        key={note.id}
        note={note}
        journal={journal}
        onUpdateNote={onUpdateProgressNote}
        onDeleteNote={onDeleteProgressNote}
        onDeleteImage={onDeleteProgressNoteImage}
        disabled={disabled}
      />
    ));
    return journal ? (
      <JournalThread>{entries}</JournalThread>
    ) : (
      <div className="divide-border/40 flex flex-col divide-y">{entries}</div>
    );
  }
);

export default ProgressNotesList;
