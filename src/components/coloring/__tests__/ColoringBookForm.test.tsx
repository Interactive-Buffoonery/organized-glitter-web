import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import {
  beforeEach,
  describe,
  expect,
  fireEvent,
  it,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from '@/test-utils';
import type { ColoringBookDTO } from '@/services/pocketbase/coloring.service';
import { ColoringBookForm } from '../ColoringBookForm';
import { getDraftGeneration, readFormDraft } from '@/hooks/drafts/formDraftStorage';
import { isColoringBookDraftValues } from '@/hooks/drafts/formDraftAdapters';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import {
  captureSessionDrafts,
  clearSessionDrafts,
  registerSessionDraft,
  takeSessionDraft,
} from '@/services/auth/sessionRecovery';

const coloringTagsServiceMock = vi.hoisted(() => ({
  listColoringTags: vi.fn(async () => ({ status: 'success', data: [] })),
  createColoringTag: vi.fn(async () => ({ status: 'success', data: null })),
}));
const cropDialogState = vi.hoisted(() => ({ file: null as File | null, open: false }));

vi.mock('@/services/pocketbase/coloringTags.service', () => ({
  ColoringTagService: coloringTagsServiceMock,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, initialCheckComplete: true }),
}));

vi.mock('@/components/image/ImageCropDialog', () => ({
  ImageCropDialog: ({ open, file }: { open: boolean; file: File | null }) => {
    cropDialogState.file = file;
    cropDialogState.open = open;
    return open ? <div role="dialog" aria-label="Crop cover" /> : null;
  },
}));

const coloringBook = (totalPages = 50): ColoringBookDTO => ({
  id: 'book-1',
  userId: 'user-1',
  title: 'Worlds of Wonder',
  publisherId: '',
  illustratorId: '',
  series: '',
  theme: '',
  isbn: '',
  publicationYear: undefined,
  edition: '',
  language: '',
  sourceUrl: '',
  datePurchased: '',
  dateReceived: '',
  dateStarted: '',
  dateCompleted: '',
  bookFormat: '',
  notes: '',
  coverImage: '',
  isMystery: false,
  status: 'purchased',
  totalPages,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
});

describe('ColoringBookForm', () => {
  beforeEach(() => {
    cropDialogState.file = null;
    cropDialogState.open = false;
    clearSessionDrafts();
    localStorage.clear();
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.setPointerCapture ??= vi.fn();
    Element.prototype.releasePointerCapture ??= vi.fn();
    Element.prototype.scrollIntoView ??= vi.fn();
  });

  it('restores a cover file that was waiting in the crop dialog', async () => {
    const user = userEvent.setup();
    const props = { ...baseProps, sessionDraftKey: 'coloring-new-test', accountId: 'user-1' };
    const first = renderWithProviders(<ColoringBookForm {...props} />);
    const file = new File(['cover'], 'pending-cover.png', { type: 'image/png' });

    await user.upload(screen.getByLabelText('Cover image'), file);
    captureSessionDrafts('user-1', 'expired-crop-token');
    first.unmount();

    renderWithProviders(<ColoringBookForm {...props} />);
    expect(cropDialogState.open).toBe(true);
    expect(cropDialogState.file).toBe(file);
  });

  it('keeps the missing-photo gate after restoring a session draft', () => {
    const props = {
      ...baseProps,
      initialBook: coloringBook(),
      sessionDraftKey: 'coloring-missing-photo',
      accountId: 'user-1',
    };
    const first = renderWithProviders(<ColoringBookForm {...props} />);
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Unsent note' } });
    captureSessionDrafts('user-1', 'first-photo-token');
    const saved = takeSessionDraft<Record<string, unknown>>('coloring-missing-photo', 'user-1');
    expect(saved).toBeDefined();
    first.unmount();

    const unregister = registerSessionDraft('coloring-missing-photo', () => ({
      ...saved,
      missingPhoto: true,
    }));
    captureSessionDrafts('user-1', 'second-photo-token');
    unregister();
    renderWithProviders(<ColoringBookForm {...props} />);

    expect(screen.getByText('Select your photo again before saving.')).toBeInTheDocument();
  });

  it('keeps the captured revision when restoring an edit from the same account', async () => {
    const user = userEvent.setup();
    const sessionDraftKey = 'coloring-stale-edit';
    const first = renderWithProviders(
      <ColoringBookForm
        {...baseProps}
        initialBook={{ ...coloringBook(), revision: 2 }}
        sessionDraftKey={sessionDraftKey}
        accountId="user-1"
      />
    );

    await user.type(screen.getByLabelText('Notes'), 'Recovered note');
    captureSessionDrafts('user-1', 'expired-edit-token');
    first.unmount();

    const onSubmit = vi.fn().mockResolvedValue(false);
    const onSessionDraftConflict = vi.fn();
    const second = renderWithProviders(
      <ColoringBookForm
        {...baseProps}
        initialBook={{ ...coloringBook(), revision: 5 }}
        sessionDraftKey={sessionDraftKey}
        accountId="user-1"
        submitLabel="Update book"
        onSubmit={onSubmit}
        onSessionDraftConflict={onSessionDraftConflict}
      />
    );

    expect(screen.getByLabelText('Notes')).toHaveValue('Recovered note');
    await waitFor(() => expect(onSessionDraftConflict).toHaveBeenCalledWith(true));
    await user.click(screen.getByRole('button', { name: 'Discard draft' }));
    captureSessionDrafts('user-1', 'expired-edit-token-again');
    second.unmount();

    onSessionDraftConflict.mockClear();
    renderWithProviders(
      <ColoringBookForm
        {...baseProps}
        initialBook={{ ...coloringBook(), revision: 5 }}
        sessionDraftKey={sessionDraftKey}
        accountId="user-1"
        submitLabel="Update book"
        onSubmit={onSubmit}
        onSessionDraftConflict={onSessionDraftConflict}
      />
    );

    expect(screen.getByLabelText('Notes')).toHaveValue('Recovered note');
    await waitFor(() => expect(onSessionDraftConflict).toHaveBeenCalledWith(true));
    await user.click(screen.getByRole('button', { name: 'Discard draft' }));
    await user.click(screen.getByRole('button', { name: 'Update book' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ notes: 'Recovered note' }),
        expect.any(Function),
        2
      )
    );
  });
  const baseProps = {
    publishers: [{ id: 'pub-1', name: 'Penguin Random House', website_url: '' }],
    illustrators: [{ id: 'ill-1', name: 'Jeremy Mariez' }],
    submitLabel: 'Add book',
    submittingLabel: 'Adding...',
    onCancel: vi.fn(),
    onSubmit: vi.fn(),
    onCreatePublisher: vi.fn(),
    onCreateIllustrator: vi.fn(),
  };

  it('submits validated book metadata with default status', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(<ColoringBookForm {...baseProps} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/Title/), 'Disney Mystery Coloring: Pixar');
    await user.clear(screen.getByLabelText(/Number of pages/));
    await user.type(screen.getByLabelText(/Number of pages/), '100');
    await user.type(screen.getByLabelText('Source URL'), 'https://example.com/book');
    await user.type(screen.getByLabelText('Notes'), 'Bought for marker practice.');
    await user.click(screen.getByLabelText('Mystery coloring book?'));
    await user.click(screen.getByRole('button', { name: 'Add book' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Disney Mystery Coloring: Pixar',
          totalPages: 100,
          status: 'purchased',
          isMystery: true,
          sourceUrl: 'https://example.com/book',
          notes: 'Bought for marker practice.',
        }),
        expect.any(Function)
      );
    });
  });

  it('completes a book when a completion date is entered', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<ColoringBookForm {...baseProps} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/Title/), 'Finished book');
    fireEvent.change(screen.getByLabelText('Completed'), { target: { value: '2026-09-20' } });
    await user.click(screen.getByRole('button', { name: 'Add book' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ dateCompleted: '2026-09-20', status: 'completed' }),
        expect.any(Function)
      );
    });
  });

  it('keeps a manual book status when its saved completion date is retyped or restored', () => {
    renderWithProviders(
      <ColoringBookForm
        {...baseProps}
        initialBook={{ ...coloringBook(), dateCompleted: '2025-03-01' }}
      />
    );
    const completedDate = screen.getByLabelText('Completed');
    const status = screen.getByRole('combobox', { name: 'Status' });

    fireEvent.change(completedDate, { target: { value: '2025-03-' } });
    fireEvent.change(completedDate, { target: { value: '2025-03-01' } });
    expect(status).toHaveTextContent('Purchased');

    fireEvent.change(completedDate, { target: { value: '2025-03-02' } });
    expect(status).toHaveTextContent('Completed');

    fireEvent.change(completedDate, { target: { value: '2025-03-01' } });
    expect(status).toHaveTextContent('Purchased');
  });

  it('restores the prior book status when a new completion date is cleared', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ColoringBookForm {...baseProps} initialBook={coloringBook()} onSubmit={onSubmit} />
    );
    const completedDate = screen.getByLabelText('Completed');

    fireEvent.change(completedDate, { target: { value: '2026-09-20' } });
    fireEvent.change(completedDate, { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: 'Add book' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ dateCompleted: '', status: 'purchased' }),
        expect.any(Function),
        0
      );
    });
  });

  it('restores the prior book status after a session expires with a completion date', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const props = {
      ...baseProps,
      onSubmit,
      initialBook: coloringBook(),
      sessionDraftKey: 'coloring-edit-status',
      accountId: 'user-1',
    };
    const first = renderWithProviders(<ColoringBookForm {...props} />);
    fireEvent.change(screen.getByLabelText('Completed'), { target: { value: '2026-09-20' } });
    captureSessionDrafts('user-1', 'expired-status-token');
    first.unmount();
    localStorage.clear();

    renderWithProviders(<ColoringBookForm {...props} />);
    expect(screen.getByLabelText('Completed')).toHaveValue('2026-09-20');
    fireEvent.change(screen.getByLabelText('Completed'), { target: { value: '' } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add book' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ dateCompleted: '', status: 'purchased' }),
        expect.any(Function),
        0
      )
    );
  });

  it('restores the prior book status when a changed saved completion date is cleared', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ColoringBookForm
        {...baseProps}
        initialBook={{ ...coloringBook(), dateCompleted: '2025-03-01' }}
        onSubmit={onSubmit}
      />
    );
    const completedDate = screen.getByLabelText('Completed');

    fireEvent.change(completedDate, { target: { value: '2025-03-02' } });
    fireEvent.change(completedDate, { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: 'Add book' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ dateCompleted: '', status: 'purchased' }),
        expect.any(Function),
        0
      );
    });
  });

  it('keeps a changed completion date Completed after a manual active status choice', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ColoringBookForm {...baseProps} initialBook={coloringBook()} onSubmit={onSubmit} />
    );
    fireEvent.change(screen.getByLabelText('Completed'), { target: { value: '2026-09-20' } });

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'In progress' }));
    await user.click(screen.getByRole('button', { name: 'Add book' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ dateCompleted: '2026-09-20', status: 'completed' }),
        expect.any(Function),
        0
      );
    });
  });

  it('lets users replace the default page count without restoring a leading zero', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(<ColoringBookForm {...baseProps} onSubmit={onSubmit} />);

    const pageCountInput = screen.getByLabelText(/Number of pages/);

    await user.clear(pageCountInput);

    expect(pageCountInput).toHaveDisplayValue('');

    await user.type(pageCountInput, '50');
    await user.type(screen.getByLabelText(/Title/), 'Worlds of Wonder');
    await user.click(screen.getByRole('button', { name: 'Add book' }));

    expect(pageCountInput).toHaveDisplayValue('50');
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ totalPages: 50 }),
        expect.any(Function)
      );
    });
  });

  it('keeps page count empty when users clear it before validation', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(<ColoringBookForm {...baseProps} onSubmit={onSubmit} />);

    const pageCountInput = screen.getByLabelText(/Number of pages/);

    await user.clear(pageCountInput);
    await user.type(screen.getByLabelText(/Title/), 'Worlds of Wonder');
    await user.click(screen.getByRole('button', { name: 'Add book' }));

    expect(pageCountInput).toHaveDisplayValue('');
    expect(await screen.findByText('Total pages must be at least 1')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders a PocketBase zero-default publication year as empty', () => {
    renderWithProviders(<ColoringBookForm {...baseProps} initialBook={coloringBook()} />);

    expect(screen.getByLabelText('Publication year')).toHaveDisplayValue('');
  });

  it('keeps a removed cover removed in the restored preview', async () => {
    const user = userEvent.setup();
    const props = {
      ...baseProps,
      initialBook: coloringBook(),
      coverUrl: 'https://example.test/old-cover.jpg',
    };
    const first = renderWithProviders(<ColoringBookForm {...props} />);
    await user.click(screen.getByRole('button', { name: 'Remove cover image' }));
    first.unmount();

    renderWithProviders(<ColoringBookForm {...props} />);
    await user.click(await screen.findByRole('button', { name: 'Restore draft' }));

    expect(screen.queryByRole('button', { name: 'Remove cover image' })).not.toBeInTheDocument();
    expect(screen.getByText('Choose cover image')).toBeInTheDocument();
  });

  it('reminds the user to reselect a cover interrupted during cropping', async () => {
    const user = userEvent.setup();
    const first = renderWithProviders(<ColoringBookForm {...baseProps} />);
    const file = new File(['cover'], 'cover.png', { type: 'image/png' });

    await user.upload(screen.getByLabelText('Cover image'), file);
    const identity = {
      backendUrl: POCKETBASE_URL,
      accountId: 'user-1',
      kind: 'coloring-book-new' as const,
      recordId: undefined,
    };
    const generation = getDraftGeneration(identity)!;
    first.unmount();

    expect(
      readFormDraft(identity, generation, isColoringBookDraftValues).draft?.values.hadNewPhoto
    ).toBe(true);

    renderWithProviders(<ColoringBookForm {...baseProps} />);
    await user.click(await screen.findByRole('button', { name: 'Restore draft' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('keeps the original server timestamp when the edit query refreshes', async () => {
    const book = coloringBook();
    const view = renderWithProviders(<ColoringBookForm {...baseProps} initialBook={book} />);
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Draft note' } });
    view.rerender(
      <ColoringBookForm {...baseProps} initialBook={{ ...book, updatedAt: '2026-02-01' }} />
    );

    const identity = {
      backendUrl: POCKETBASE_URL,
      accountId: 'user-1',
      kind: 'coloring-book-edit' as const,
      recordId: book.id,
    };
    const generation = getDraftGeneration(identity)!;
    await waitFor(
      () => {
        expect(
          readFormDraft(identity, generation, isColoringBookDraftValues).draft?.baselineUpdatedAt
        ).toBe('2026-01-01');
      },
      { timeout: 2000 }
    );
  });

  it('caps new books while allowing an existing larger book to be saved unchanged', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const firstRender = renderWithProviders(
      <ColoringBookForm {...baseProps} onSubmit={onSubmit} />
    );

    expect(screen.getByLabelText(/Number of pages/)).toHaveAttribute('max', '500');
    firstRender.unmount();

    renderWithProviders(
      <ColoringBookForm
        {...baseProps}
        initialBook={coloringBook(600)}
        onSubmit={onSubmit}
        submitLabel="Save changes"
      />
    );

    expect(screen.getByLabelText(/Number of pages/)).toHaveAttribute('max', '600');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ totalPages: 600 }),
        expect.any(Function),
        0
      );
    });
  });

  it('announces the full-page page-limit error', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(<ColoringBookForm {...baseProps} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/Title/), 'Worlds of Wonder');
    await user.clear(screen.getByLabelText(/Number of pages/));
    await user.type(screen.getByLabelText(/Number of pages/), '501');
    await user.click(screen.getByRole('button', { name: 'Add book' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Total pages must be 500 or less');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('hides ownership controls', () => {
    renderWithProviders(<ColoringBookForm {...baseProps} />);

    expect(screen.queryByLabelText(/Ownership/)).not.toBeInTheDocument();
    expect(screen.queryByText('Ownership')).not.toBeInTheDocument();
  });

  it('shows title validation before submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(<ColoringBookForm {...baseProps} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Add book' }));

    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders the diamond-style sections', async () => {
    renderWithProviders(<ColoringBookForm {...baseProps} />);

    expect(screen.getByRole('heading', { name: 'Book' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Book Info' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dates' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Source URL' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cover image' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Status' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Tags' }).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByRole('heading', { name: 'Creators' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Library info' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Credits' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Publisher')).toBeInTheDocument();
    expect(screen.getByLabelText('Illustrator')).toBeInTheDocument();
    expect(screen.queryByLabelText('Difficulty')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mediums')).not.toBeInTheDocument();
  });

  it('adds coloring tags with the diamond-style inline tag control', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    coloringTagsServiceMock.listColoringTags.mockResolvedValueOnce({
      status: 'success',
      data: [
        {
          id: 'tag-1',
          userId: 'user-1',
          name: 'Disney princesses',
          slug: 'disney-princesses',
          color: '#ec4899',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
    });

    renderWithProviders(<ColoringBookForm {...baseProps} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/Title/), 'Disney Mystery Coloring');
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(await screen.findByRole('option', { name: 'Disney princesses' }));

    expect(screen.getByText('Disney princesses')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add book' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: [expect.objectContaining({ id: 'tag-1', name: 'Disney princesses' })],
        }),
        expect.any(Function)
      );
    });
  });

  it('keeps footer submit and cancel wired', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onCancel = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(
      <ColoringBookForm {...baseProps} onCancel={onCancel} onSubmit={onSubmit} />
    );

    await user.type(screen.getByLabelText(/Title/), 'Worlds of Wonder');
    await user.click(screen.getByRole('button', { name: 'Add book' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Worlds of Wonder',
          totalPages: 1,
          status: 'purchased',
        }),
        expect.any(Function)
      );
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it('blocks duplicate submits before parent pending state catches up', async () => {
    let resolveSubmit: (() => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveSubmit = resolve;
        })
    );

    renderWithProviders(<ColoringBookForm {...baseProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Worlds of Wonder' } });
    const submitButton = screen.getByRole('button', { name: 'Add book' });

    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Adding...' })).toBeDisabled();

    resolveSubmit?.();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add book' })).toBeEnabled();
    });
  });

  it('disables cover and tag controls during the immediate submit lock', async () => {
    let resolveSubmit: (() => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveSubmit = resolve;
        })
    );

    renderWithProviders(
      <ColoringBookForm {...baseProps} coverUrl="/cover.jpg" onSubmit={onSubmit} />
    );

    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Worlds of Wonder' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add book' }));

    expect(screen.getByRole('button', { name: 'Adding...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove cover image' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add tag' })).toBeDisabled();

    resolveSubmit?.();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add book' })).toBeEnabled();
    });
  });

  it('shows replace cover copy when an existing cover is present', () => {
    renderWithProviders(<ColoringBookForm {...baseProps} coverUrl="/cover.jpg" />);

    expect(screen.getByText('Replace cover image')).toBeInTheDocument();
    expect(screen.queryByText('Choose cover image')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cover image')).toHaveClass('sr-only');
  });
});
