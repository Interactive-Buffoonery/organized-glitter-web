import '@testing-library/jest-dom/vitest';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import type { ProgressNote } from '@/types/project';
import { ColoringPageProgressNotes } from '../ColoringPageProgressNotes';

const {
  useColoringPageProgressNotesMock,
  addNoteMutationState,
  updateNoteMutationState,
  deleteNoteMutationState,
  deleteNoteImageMutationState,
} = vi.hoisted(() => ({
  useColoringPageProgressNotesMock: vi.fn(),
  addNoteMutationState: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  updateNoteMutationState: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  deleteNoteMutationState: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  deleteNoteImageMutationState: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
}));

vi.mock('@/hooks/queries/coloring/useColoringPageProgressNotes', () => ({
  useColoringPageProgressNotes: (pageId: string | null) => useColoringPageProgressNotesMock(pageId),
}));

vi.mock('@/hooks/mutations/coloring/useColoringPageProgressNotes', () => ({
  useAddColoringPageProgressNoteMutation: () => addNoteMutationState,
  useUpdateColoringPageProgressNoteMutation: () => updateNoteMutationState,
  useDeleteColoringPageProgressNoteMutation: () => deleteNoteMutationState,
  useDeleteColoringPageProgressNoteImageMutation: () => deleteNoteImageMutationState,
}));

vi.mock('@/components/projects/timeline/ProgressNotesList', () => ({
  default: ({ progressNotes, disabled }: { progressNotes: ProgressNote[]; disabled?: boolean }) => (
    <div data-testid="progress-notes-list">
      <span>Notes: {progressNotes.length}</span>
      <span>{disabled ? 'Disabled' : 'Enabled'}</span>
    </div>
  ),
}));

vi.mock('@/components/projects/ProgressNoteForm', () => ({
  default: ({
    onSubmit,
    disabled,
  }: {
    onSubmit: (data: { date: string; content: string }) => Promise<void>;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() =>
        void onSubmit({
          date: '2026-05-06',
          content: 'Finished the background',
        })
      }
    >
      Submit page progress note
    </button>
  ),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }) => (open ? <div role="dialog">{children}</div> : null),
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  DialogDescription: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <p className={className}>{children}</p>,
}));

describe('ColoringPageProgressNotes', () => {
  beforeEach(() => {
    useColoringPageProgressNotesMock.mockReset().mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
    addNoteMutationState.mutateAsync.mockReset().mockResolvedValue(undefined);
    addNoteMutationState.isPending = false;
    updateNoteMutationState.mutateAsync.mockReset();
    updateNoteMutationState.isPending = false;
    deleteNoteMutationState.mutateAsync.mockReset();
    deleteNoteMutationState.isPending = false;
    deleteNoteImageMutationState.mutateAsync.mockReset();
    deleteNoteImageMutationState.isPending = false;
  });

  it('preserves the mounted timeline during a failed background refetch', () => {
    const data = [{ id: 'note-1', content: 'Saved note' }];
    useColoringPageProgressNotesMock.mockReturnValue({ data, isLoading: false, error: null });
    const { rerender } = renderWithProviders(<ColoringPageProgressNotes pageId="page-123" />);
    const list = screen.getByTestId('progress-notes-list');
    useColoringPageProgressNotesMock.mockReturnValue({
      data,
      isLoading: false,
      error: new Error('Offline'),
    });
    rerender(<ColoringPageProgressNotes pageId="page-123" />);
    expect(screen.getByTestId('progress-notes-list')).toBe(list);
  });

  it('uses the first-note copy and hides the list when there are no notes', () => {
    renderWithProviders(<ColoringPageProgressNotes pageId="page-123" />);

    expect(
      screen.getByRole('button', { name: /add your first progress note/i })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('progress-notes-list')).not.toBeInTheDocument();
  });

  it('shows the timeline when page progress notes exist', () => {
    useColoringPageProgressNotesMock.mockReturnValue({
      data: [
        {
          id: 'note-1',
          pageId: 'page-123',
          content: 'Finished the background',
          date: '2026-05-05',
          createdAt: '2026-05-05T00:00:00.000Z',
          updatedAt: '2026-05-05T00:00:00.000Z',
        },
      ],
      isLoading: false,
      error: null,
    });

    renderWithProviders(<ColoringPageProgressNotes pageId="page-123" />);

    expect(screen.getByRole('button', { name: /add a progress note/i })).toBeInTheDocument();
    expect(screen.getByTestId('progress-notes-list')).toHaveTextContent('Notes: 1');
  });

  it('closes the add-note dialog after a successful submit', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ColoringPageProgressNotes pageId="page-123" />);

    await user.click(screen.getByRole('button', { name: /add your first progress note/i }));
    expect(screen.getByRole('heading', { name: 'Add a progress note' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Submit page progress note' }));

    await waitFor(() => {
      expect(addNoteMutationState.mutateAsync).toHaveBeenCalledWith({
        pageId: 'page-123',
        noteData: {
          date: '2026-05-06',
          content: 'Finished the background',
        },
      });
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Add a progress note' })
      ).not.toBeInTheDocument();
    });
  });

  it('shows the provided coloring page target context in the add-note dialog', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ColoringPageProgressNotes
        pageId="page-123"
        target={{
          kind: 'coloring-page',
          title: 'Page 4',
          subtitle: 'Coloring · Garden Book',
          thumbnailUrl: null,
        }}
      />
    );

    await user.click(screen.getByRole('button', { name: /add your first progress note/i }));

    expect(
      screen.getByRole('heading', { name: 'Add progress note to Page 4' })
    ).toBeInTheDocument();
    expect(screen.getByText('Coloring · Garden Book')).toBeInTheDocument();
    expect(screen.queryByText('Coloring page progress note')).not.toBeInTheDocument();
  });

  it('uses the keyboard-safe progress note dialog surface', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ColoringPageProgressNotes pageId="page-123" />);

    await user.click(screen.getByRole('button', { name: /add your first progress note/i }));

    expect(screen.getByTestId('dialog-content')).toHaveClass('progress-note-dialog-content');
  });

  it('keeps the add-note dialog open when submit fails', async () => {
    const user = userEvent.setup();
    addNoteMutationState.mutateAsync.mockRejectedValueOnce(new Error('Save failed'));

    renderWithProviders(<ColoringPageProgressNotes pageId="page-123" />);

    await user.click(screen.getByRole('button', { name: /add your first progress note/i }));
    await user.click(screen.getByRole('button', { name: 'Submit page progress note' }));

    await waitFor(() => {
      expect(addNoteMutationState.mutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('heading', { name: 'Add a progress note' })).toBeInTheDocument();
  });
});
