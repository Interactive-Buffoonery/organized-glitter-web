import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { AddNoteCTA } from '../AddNoteCTA';
import type { AddNoteData } from '@/hooks/useAddNoteFlow';
import type { ProgressNoteDialogTarget } from '@/components/projects/ProgressNoteDialog';
import type { PickerMode } from '../NoteTargetPicker';

const { submitNoteMock, pickerPropsMock, dialogPropsMock } = vi.hoisted(() => ({
  submitNoteMock: vi.fn(),
  pickerPropsMock: vi.fn(),
  dialogPropsMock: vi.fn(),
}));

vi.mock('@/hooks/useAddNoteFlow', () => ({
  useAddNoteFlow: () => ({
    submitNote: submitNoteMock,
    isSubmitting: false,
  }),
}));

vi.mock('../NoteTargetPicker', () => ({
  NoteTargetPicker: ({ open, mode }: { open: boolean; mode?: PickerMode }) => {
    pickerPropsMock({ open, mode });
    return open ? <dialog open>Target picker {mode?.kind}</dialog> : null;
  },
}));

vi.mock('@/components/projects/ProgressNoteDialog', () => ({
  ProgressNoteDialog: ({
    open,
    onSubmit,
    target,
  }: {
    open: boolean;
    onSubmit: (noteData: AddNoteData) => Promise<void>;
    target?: ProgressNoteDialogTarget;
  }) => {
    dialogPropsMock({ open, target });

    return open ? (
      <dialog open aria-label="Direct note dialog">
        {target ? <span data-testid="direct-note-target">{target.title}</span> : null}
        <button
          type="button"
          onClick={() =>
            void onSubmit({
              date: '2026-05-01',
              content: 'Worked on it' as AddNoteData['content'],
            })
          }
        >
          Submit direct note
        </button>
      </dialog>
    ) : null;
  },
}));

describe('AddNoteCTA', () => {
  beforeEach(() => {
    submitNoteMock.mockReset().mockResolvedValue(undefined);
    pickerPropsMock.mockReset();
    dialogPropsMock.mockReset();
  });

  it('opens the general target picker for the unscoped all feed', async () => {
    const user = userEvent.setup();

    renderWithProviders(<AddNoteCTA visibleTab="all" sourceId="all" />);

    await user.click(screen.getByRole('button', { name: 'Add a progress note' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Target picker targets');
    expect(pickerPropsMock).toHaveBeenLastCalledWith({
      open: true,
      mode: { kind: 'targets' },
    });
  });

  it('opens the composer directly for a scoped diamond feed', async () => {
    const user = userEvent.setup();

    renderWithProviders(<AddNoteCTA visibleTab="diamond" sourceId="project-1" />);

    await user.click(screen.getByRole('button', { name: 'Add a progress note' }));

    expect(screen.getByRole('dialog', { name: 'Direct note dialog' })).toBeInTheDocument();
  });

  it('submits scoped diamond notes with the source project id', async () => {
    const user = userEvent.setup();

    renderWithProviders(<AddNoteCTA visibleTab="diamond" sourceId="project-1" />);

    await user.click(screen.getByRole('button', { name: 'Add a progress note' }));
    await user.click(screen.getByRole('button', { name: 'Submit direct note' }));

    await waitFor(() => {
      expect(submitNoteMock).toHaveBeenCalledWith(
        { kind: 'diamond-project', id: 'project-1' },
        expect.objectContaining({ date: '2026-05-01' })
      );
    });
  });

  it('passes the optional target into the direct diamond composer', async () => {
    const user = userEvent.setup();
    const target: ProgressNoteDialogTarget = {
      kind: 'diamond-project',
      title: 'Active Garden Kit',
      subtitle: 'Diamond painting',
      thumbnailUrl: null,
    };

    renderWithProviders(<AddNoteCTA visibleTab="diamond" sourceId="project-1" target={target} />);

    await user.click(screen.getByRole('button', { name: 'Add a progress note' }));

    expect(screen.getByTestId('direct-note-target')).toHaveTextContent('Active Garden Kit');
    expect(dialogPropsMock).toHaveBeenLastCalledWith({
      open: true,
      target,
    });
  });

  it('opens the book picker for a scoped coloring feed', async () => {
    const user = userEvent.setup();

    renderWithProviders(<AddNoteCTA visibleTab="coloring" sourceId="book-1" />);

    await user.click(screen.getByRole('button', { name: 'Add a progress note' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Target picker book');
    expect(pickerPropsMock).toHaveBeenLastCalledWith({
      open: true,
      mode: { kind: 'book', bookId: 'book-1' },
    });
  });

  it('renders a non-submit button with a visible label', () => {
    renderWithProviders(<AddNoteCTA visibleTab="all" sourceId="all" />);

    expect(screen.getByRole('button', { name: 'Add a progress note' })).toHaveAttribute(
      'type',
      'button'
    );
  });
});
