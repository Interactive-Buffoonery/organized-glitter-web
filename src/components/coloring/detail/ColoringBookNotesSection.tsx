import { sessionDraftKeys } from '@/services/auth/sessionDraftKeys';
import ProjectNotes from '@/components/projects/form/ProjectNotes';
import { SectionHeading } from '@/components/shared/Section';

interface ColoringBookNotesSectionProps {
  bookId: string;
  accountId?: string;
  notes: string;
  readOnly: boolean;
  onSave: (nextNotes: string) => Promise<void>;
}

export const ColoringBookNotesSection = ({
  bookId,
  accountId,
  notes,
  readOnly,
  onSave,
}: ColoringBookNotesSectionProps) => (
  <section className="space-y-4">
    <SectionHeading>Notes</SectionHeading>
    <div className="group/notes max-w-3xl">
      <ProjectNotes
        sessionDraftKey={sessionDraftKeys.coloringBookNotes(bookId)}
        accountId={accountId}
        notes={notes}
        onSave={onSave}
        readOnly={readOnly}
        variant="inline"
        placeholder="Add any notes about this coloring book..."
        ariaLabel="Coloring book notes"
        emptyPlaceholder="No notes yet. Click the pencil to add some thoughts."
      />
    </div>
  </section>
);
