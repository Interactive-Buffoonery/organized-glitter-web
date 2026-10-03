import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { NoteTargetPicker } from '../NoteTargetPicker';
import type { AddNoteData } from '@/hooks/useAddNoteFlow';
import type { ProgressNoteDialogTarget } from '@/components/projects/ProgressNoteDialog';
import type { NoteTarget } from '@/services/pocketbase/overview.service';

const { useNoteTargetsMock, useBookNoteTargetsMock, submitNoteMock, isMobileState } = vi.hoisted(
  () => ({
    useNoteTargetsMock: vi.fn(),
    useBookNoteTargetsMock: vi.fn(),
    submitNoteMock: vi.fn(),
    isMobileState: { value: false },
  })
);

vi.mock('@/hooks/queries/useNoteTargets', () => ({
  useNoteTargets: (options: unknown) => useNoteTargetsMock(options),
}));

vi.mock('@/hooks/queries/useBookNoteTargets', () => ({
  useBookNoteTargets: (bookId: string | undefined, options: unknown) =>
    useBookNoteTargetsMock(bookId, options),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => isMobileState.value,
}));

vi.mock('@/hooks/useAddNoteFlow', () => ({
  useAddNoteFlow: () => ({
    submitNote: submitNoteMock,
    isSubmitting: false,
  }),
}));

vi.mock('@/components/projects/ProgressNoteDialog', () => ({
  ProgressNoteDialog: ({
    open,
    onOpenChange,
    onSubmit,
    target,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (noteData: AddNoteData) => Promise<void>;
    target?: ProgressNoteDialogTarget;
  }) =>
    open ? (
      <dialog open aria-label="Progress note composer">
        {target ? (
          <div data-testid="composer-target">
            <span>{target.kind}</span>
            <span>{target.title}</span>
            <span>{target.subtitle}</span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void onSubmit({
              date: '2026-05-01',
              content: 'Worked on it' as AddNoteData['content'],
            }).catch(() => undefined);
          }}
        >
          Submit note
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Cancel note
        </button>
      </dialog>
    ) : null,
}));

const activeTargets: NoteTarget[] = [
  {
    id: 'active-project',
    kind: 'diamond-project',
    craft: 'diamond',
    title: 'Active Garden Kit',
    subtitle: 'Diamond painting',
    thumbnailUrl: null,
    updatedAt: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'active-page',
    kind: 'coloring-page',
    craft: 'coloring',
    title: 'Page 4',
    subtitle: 'Coloring · Active Florals',
    thumbnailUrl: null,
    updatedAt: '2026-04-30T00:00:00.000Z',
  },
];

const searchTargets: NoteTarget[] = [
  {
    id: 'wishlist-project',
    kind: 'diamond-project',
    craft: 'diamond',
    title: 'Wishlist Winter Kit',
    subtitle: 'Diamond painting · Snow Studio',
    thumbnailUrl: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const bookTargets: NoteTarget[] = [
  {
    id: 'book-page-1',
    kind: 'coloring-page',
    craft: 'coloring',
    title: 'Page 1',
    subtitle: 'Coloring · Garden Book',
    thumbnailUrl: null,
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'book-page-8',
    kind: 'coloring-page',
    craft: 'coloring',
    title: 'Page 8',
    subtitle: 'Coloring · Winter Book',
    thumbnailUrl: null,
    updatedAt: '2026-02-08T00:00:00.000Z',
  },
];

describe('NoteTargetPicker', () => {
  beforeEach(() => {
    isMobileState.value = false;
    submitNoteMock.mockReset().mockResolvedValue(undefined);
    useBookNoteTargetsMock.mockReset().mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
    useNoteTargetsMock.mockReset().mockImplementation((options: { searchTerm?: string }) => ({
      data: options.searchTerm ? searchTargets : activeTargets,
      isLoading: false,
      error: null,
    }));
  });

  it('shows active targets by default', () => {
    renderWithProviders(<NoteTargetPicker open onOpenChange={vi.fn()} />);

    expect(
      screen.queryByText('Pick active work, or search for another kit or coloring page.')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Active Garden Kit')).toBeInTheDocument();
    expect(screen.getByText('Page 4')).toBeInTheDocument();
    expect(screen.queryByText('Wishlist Winter Kit')).not.toBeInTheDocument();
  });

  it('switches to search results after two characters and restores active targets when cleared', async () => {
    const user = userEvent.setup();

    renderWithProviders(<NoteTargetPicker open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText('Search kits and pages'), 'w');

    expect(useNoteTargetsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ searchTerm: '' })
    );

    await user.type(screen.getByLabelText('Search kits and pages'), 'inter');

    await waitFor(() => {
      expect(screen.getByText('Wishlist Winter Kit')).toBeInTheDocument();
    });
    expect(screen.queryByText('Active Garden Kit')).not.toBeInTheDocument();
    expect(useNoteTargetsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ searchTerm: 'winter' })
    );

    await user.clear(screen.getByLabelText('Search kits and pages'));

    await waitFor(() => {
      expect(screen.getByText('Active Garden Kit')).toBeInTheDocument();
    });
  });

  it('passes enabled verticals to useNoteTargets', () => {
    const verticals = { diamond_painting: false, coloring_books: true };

    renderWithProviders(<NoteTargetPicker open onOpenChange={vi.fn()} verticals={verticals} />);

    expect(useNoteTargetsMock).toHaveBeenLastCalledWith(expect.objectContaining({ verticals }));
  });

  it('calls useBookNoteTargets in book mode and filters pages client-side', async () => {
    const user = userEvent.setup();
    useBookNoteTargetsMock.mockReturnValue({
      data: bookTargets,
      isLoading: false,
      error: null,
    });

    renderWithProviders(
      <NoteTargetPicker open onOpenChange={vi.fn()} mode={{ kind: 'book', bookId: 'book-1' }} />
    );

    expect(useBookNoteTargetsMock).toHaveBeenLastCalledWith('book-1', { enabled: true });
    expect(screen.getByText('Page 1')).toBeInTheDocument();
    expect(screen.getByText('Page 8')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search pages in this book'), 'winter');

    expect(screen.queryByText('Page 1')).not.toBeInTheDocument();
    expect(screen.getByText('Page 8')).toBeInTheDocument();
  });

  it('opens the composer after selecting a target', async () => {
    const user = userEvent.setup();

    renderWithProviders(<NoteTargetPicker open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /active garden kit/i }));

    expect(screen.getByRole('dialog', { name: 'Progress note composer' })).toBeInTheDocument();
    expect(screen.queryByText('In-progress pages and projects')).not.toBeInTheDocument();
  });

  it('passes the selected diamond target into the composer', async () => {
    const user = userEvent.setup();

    renderWithProviders(<NoteTargetPicker open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /active garden kit/i }));

    expect(screen.getByTestId('composer-target')).toHaveTextContent('diamond-project');
    expect(screen.getByTestId('composer-target')).toHaveTextContent('Active Garden Kit');
    expect(screen.getByTestId('composer-target')).toHaveTextContent('Diamond painting');
  });

  it('passes the selected coloring page target into the composer', async () => {
    const user = userEvent.setup();

    renderWithProviders(<NoteTargetPicker open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /page 4/i }));

    expect(screen.getByTestId('composer-target')).toHaveTextContent('coloring-page');
    expect(screen.getByTestId('composer-target')).toHaveTextContent('Page 4');
    expect(screen.getByTestId('composer-target')).toHaveTextContent('Coloring · Active Florals');
  });

  it('submits the selected target and closes after success', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    renderWithProviders(<NoteTargetPicker open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: /active garden kit/i }));
    await user.click(screen.getByRole('button', { name: 'Submit note' }));

    await waitFor(() => {
      expect(submitNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'active-project', kind: 'diamond-project' }),
        expect.objectContaining({ date: '2026-05-01' })
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('keeps the composer open after failed submit', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    submitNoteMock.mockRejectedValue(new Error('nope'));

    renderWithProviders(<NoteTargetPicker open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: /active garden kit/i }));
    await user.click(screen.getByRole('button', { name: 'Submit note' }));

    await waitFor(() => {
      expect(submitNoteMock).toHaveBeenCalled();
    });
    expect(screen.getByRole('dialog', { name: 'Progress note composer' })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('renders loading, error, and empty states', () => {
    useNoteTargetsMock.mockReturnValueOnce({ data: [], isLoading: true, error: null });
    const { rerender } = renderWithProviders(<NoteTargetPicker open onOpenChange={vi.fn()} />);

    expect(document.querySelectorAll('.animate-pulse')).not.toHaveLength(0);

    useNoteTargetsMock.mockReturnValueOnce({ data: [], isLoading: false, error: new Error('no') });
    rerender(<NoteTargetPicker open onOpenChange={vi.fn()} />);

    expect(
      screen.getByText('Could not load your kits and pages. Please try again.')
    ).toBeInTheDocument();

    useNoteTargetsMock.mockReturnValueOnce({ data: [], isLoading: false, error: null });
    rerender(<NoteTargetPicker open onOpenChange={vi.fn()} />);

    expect(
      screen.getByText(
        'Nothing is in progress right now. Search for another kit or coloring page, or create one first.'
      )
    ).toBeInTheDocument();
  });
});
