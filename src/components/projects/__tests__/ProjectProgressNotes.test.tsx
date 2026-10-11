import '@testing-library/jest-dom/vitest';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import ProjectProgressNotes from '../ProjectProgressNotes';
import type { ProgressNote, ProjectType } from '@/types/project';

const {
  useProgressNotesQueryMock,
  addProgressNoteMutationState,
  updateProgressNoteMutationState,
  deleteProgressNoteMutationState,
  deleteProgressNoteImageMutationState,
} = vi.hoisted(() => ({
  useProgressNotesQueryMock: vi.fn(),
  addProgressNoteMutationState: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  updateProgressNoteMutationState: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  deleteProgressNoteMutationState: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  deleteProgressNoteImageMutationState: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
}));

vi.mock('@/hooks/queries/useProgressNotes', () => ({
  useProgressNotesQuery: (projectId: string | null) => useProgressNotesQueryMock(projectId),
}));

vi.mock('@/hooks/mutations/useProjectDetailMutations', () => ({
  useAddProgressNoteMutation: () => addProgressNoteMutationState,
  useUpdateProgressNoteMutation: () => updateProgressNoteMutationState,
  useDeleteProgressNoteMutation: () => deleteProgressNoteMutationState,
  useDeleteProgressNoteImageMutation: () => deleteProgressNoteImageMutationState,
}));

vi.mock('../timeline/ProgressNotesList', () => ({
  default: ({ progressNotes, disabled }: { progressNotes: ProgressNote[]; disabled?: boolean }) => (
    <div data-testid="progress-notes-list">
      <span>Notes: {progressNotes.length}</span>
      <span>{progressNotes.map(note => note.id).join(',')}</span>
      <span>{disabled ? 'Disabled' : 'Enabled'}</span>
    </div>
  ),
}));

vi.mock('../ProgressNoteForm', () => ({
  default: ({
    onSubmit,
    disabled,
  }: {
    onSubmit: (data: { date: string; content: string }) => Promise<void>;
    disabled?: boolean;
  }) => (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const payload = { date: '2026-05-01', content: 'Finished a section' };
          return void onSubmit(payload);
        }}
      >
        Submit progress note
      </button>
    </div>
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

const baseProject: ProjectType = {
  id: 'project-123',
  userId: 'user-123',
  title: 'Aurora Wolves',
  company: 'Glitter Co',
  artist: 'Wolf Artist',
  status: 'progress' as const,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};
const targetHeadingName = 'Add progress note to Aurora Wolves';

const note: ProgressNote = {
  id: 'note-1',
  projectId: 'project-123',
  content: 'Finished the border',
  date: '2026-04-30',
  createdAt: '2026-04-30T00:00:00.000Z',
  updatedAt: '2026-04-30T00:00:00.000Z',
};

describe('ProjectProgressNotes', () => {
  beforeEach(() => {
    useProgressNotesQueryMock.mockReset().mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
    addProgressNoteMutationState.mutateAsync.mockReset().mockResolvedValue(undefined);
    addProgressNoteMutationState.isPending = false;
    updateProgressNoteMutationState.mutateAsync.mockReset();
    updateProgressNoteMutationState.isPending = false;
    deleteProgressNoteMutationState.mutateAsync.mockReset();
    deleteProgressNoteMutationState.isPending = false;
    deleteProgressNoteImageMutationState.mutateAsync.mockReset();
    deleteProgressNoteImageMutationState.isPending = false;
  });

  it('shows the load error when no progress notes exist', () => {
    useProgressNotesQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: new Error('Offline'),
    });

    renderWithProviders(<ProjectProgressNotes project={baseProject} />);

    expect(screen.getByText('Error loading progress notes. Please try again.')).toBeInTheDocument();
    expect(screen.queryByTestId('progress-notes-list')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add a progress note/i })).not.toBeInTheDocument();
  });

  it('preserves the mounted timeline during a failed background refetch', () => {
    const data = [{ id: 'note-1', content: 'Saved note' }];
    useProgressNotesQueryMock.mockReturnValue({ data, isLoading: false, error: null });
    const { rerender } = renderWithProviders(<ProjectProgressNotes project={baseProject} />);
    const list = screen.getByTestId('progress-notes-list');
    useProgressNotesQueryMock.mockReturnValue({
      data,
      isLoading: false,
      error: new Error('Offline'),
    });
    rerender(<ProjectProgressNotes project={baseProject} />);
    expect(screen.getByTestId('progress-notes-list')).toBe(list);
    expect(list).toHaveTextContent('Notes: 1');
    expect(
      screen.queryByText('Error loading progress notes. Please try again.')
    ).not.toBeInTheDocument();
  });

  it('uses the first-note copy and hides the list when there are no progress notes', () => {
    renderWithProviders(<ProjectProgressNotes project={baseProject} />);

    expect(
      screen.getByRole('button', { name: /add your first progress note/i })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('progress-notes-list')).not.toBeInTheDocument();
  });

  it('uses the standard add-row copy and keeps the timeline visible when notes exist', () => {
    useProgressNotesQueryMock.mockReturnValue({
      data: [note],
      isLoading: false,
      error: null,
    });

    renderWithProviders(<ProjectProgressNotes project={baseProject} />);

    expect(screen.getByRole('button', { name: /add a progress note/i })).toBeInTheDocument();
    expect(screen.getByTestId('progress-notes-list')).toHaveTextContent('Notes: 1');
    expect(screen.getByTestId('progress-notes-list')).toHaveTextContent('note-1');
  });

  it('closes the add-note dialog after a successful submit', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ProjectProgressNotes project={baseProject} />);

    await user.click(screen.getByRole('button', { name: /add your first progress note/i }));
    expect(screen.getByRole('heading', { name: targetHeadingName })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Submit progress note' }));

    await waitFor(() => {
      expect(addProgressNoteMutationState.mutateAsync).toHaveBeenCalledWith({
        projectId: 'project-123',
        noteData: {
          date: '2026-05-01',
          content: 'Finished a section',
        },
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: targetHeadingName })).not.toBeInTheDocument();
    });
  });

  it('shows the project target context in the add-note dialog', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ProjectProgressNotes project={baseProject} />);

    await user.click(screen.getByRole('button', { name: /add your first progress note/i }));

    expect(screen.getByRole('heading', { name: targetHeadingName })).toBeInTheDocument();
    expect(screen.getByText('Diamond painting · Glitter Co · Wolf Artist')).toBeInTheDocument();
    expect(screen.queryByText('Diamond painting progress note')).not.toBeInTheDocument();
  });

  it('uses the keyboard-safe progress note dialog surface', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ProjectProgressNotes project={baseProject} />);

    await user.click(screen.getByRole('button', { name: /add your first progress note/i }));

    expect(screen.getByTestId('dialog-content')).toHaveClass('progress-note-dialog-content');
  });

  it('keeps the add-note dialog open when submit fails', async () => {
    const user = userEvent.setup();
    addProgressNoteMutationState.mutateAsync.mockRejectedValueOnce(new Error('Save failed'));

    renderWithProviders(<ProjectProgressNotes project={baseProject} />);

    await user.click(screen.getByRole('button', { name: /add your first progress note/i }));
    await user.click(screen.getByRole('button', { name: 'Submit progress note' }));

    await waitFor(() => {
      expect(addProgressNoteMutationState.mutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('heading', { name: targetHeadingName })).toBeInTheDocument();
  });
});
