import '@testing-library/jest-dom/vitest';
import { within } from '@testing-library/react';
import { vi } from 'vitest';
import {
  beforeEach,
  describe,
  expect,
  fireEvent,
  it,
  renderWithProviders,
  userEvent,
  waitFor,
} from '@/test-utils';
import { pasteIntoField } from '@/test-utils/scopedInteractions';
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
    const form = within(first.container);
    const file = new File(['cover'], 'pending-cover.png', { type: 'image/png' });

    await user.upload(form.getByLabelText('Cover image'), file);
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
    let form = within(first.container);
    fireEvent.change(form.getByLabelText('Notes'), { target: { value: 'Unsent note' } });
    captureSessionDrafts('user-1', 'first-photo-token');
    const saved = takeSessionDraft<Record<string, unknown>>('coloring-missing-photo', 'user-1');
    expect(saved).toBeDefined();
    first.unmount();

    const unregister = registerSessionDraft('coloring-missing-photo', 'user-1', () => ({
      ...saved,
      missingPhoto: true,
    }));
    captureSessionDrafts('user-1', 'second-photo-token');
    unregister();
    const restored = renderWithProviders(<ColoringBookForm {...props} />);
    form = within(restored.container);

    expect(form.getByText('Select your photo again before saving.')).toBeInTheDocument();
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
    let form = within(first.container);

    await pasteIntoField(user, form.getByLabelText('Notes'), 'Recovered note');
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
    form = within(second.container);

    expect(form.getByLabelText('Notes')).toHaveValue('Recovered note');
    await waitFor(() => expect(onSessionDraftConflict).toHaveBeenCalledWith(true));
    await user.click(form.getByRole('button', { name: 'Discard draft' }));
    captureSessionDrafts('user-1', 'expired-edit-token-again');
    second.unmount();

    onSessionDraftConflict.mockClear();
    const third = renderWithProviders(
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
    form = within(third.container);

    expect(form.getByLabelText('Notes')).toHaveValue('Recovered note');
    await waitFor(() => expect(onSessionDraftConflict).toHaveBeenCalledWith(true));
    await user.click(form.getByRole('button', { name: 'Discard draft' }));
    await user.click(form.getByRole('button', { name: 'Update book' }));

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
    let form = within(first.container);
    fireEvent.change(form.getByLabelText('Completed'), { target: { value: '2026-09-20' } });
    captureSessionDrafts('user-1', 'expired-status-token');
    first.unmount();
    localStorage.clear();

    const restored = renderWithProviders(<ColoringBookForm {...props} />);
    form = within(restored.container);
    expect(form.getByLabelText('Completed')).toHaveValue('2026-09-20');
    fireEvent.change(form.getByLabelText('Completed'), { target: { value: '' } });
    await userEvent.setup().click(form.getByRole('button', { name: 'Add book' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ dateCompleted: '', status: 'purchased' }),
        expect.any(Function),
        0
      )
    );
  });

  it('keeps a removed cover removed in the restored preview', async () => {
    const user = userEvent.setup();
    const props = {
      ...baseProps,
      initialBook: coloringBook(),
      coverUrl: 'https://example.test/old-cover.jpg',
    };
    const first = renderWithProviders(<ColoringBookForm {...props} />);
    let form = within(first.container);
    await user.click(form.getByRole('button', { name: 'Remove cover image' }));
    first.unmount();

    const restored = renderWithProviders(<ColoringBookForm {...props} />);
    form = within(restored.container);
    await user.click(await form.findByRole('button', { name: 'Restore draft' }));

    expect(form.queryByRole('button', { name: 'Remove cover image' })).not.toBeInTheDocument();
    expect(form.getByText('Choose cover image')).toBeInTheDocument();
  });

  it('keeps the original server timestamp when the edit query refreshes', async () => {
    const book = coloringBook();
    const view = renderWithProviders(<ColoringBookForm {...baseProps} initialBook={book} />);
    const form = within(view.container);
    fireEvent.change(form.getByLabelText('Notes'), { target: { value: 'Draft note' } });
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

  it('blocks duplicate submits before parent pending state catches up', async () => {
    let resolveSubmit: (() => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveSubmit = resolve;
        })
    );

    const view = renderWithProviders(<ColoringBookForm {...baseProps} onSubmit={onSubmit} />);
    const form = within(view.container);

    fireEvent.change(form.getByLabelText(/Title/), { target: { value: 'Worlds of Wonder' } });
    const submitButton = form.getByRole('button', { name: 'Add book' });

    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(form.getByRole('button', { name: 'Adding...' })).toBeDisabled();

    resolveSubmit?.();

    await waitFor(() => {
      expect(form.getByRole('button', { name: 'Add book' })).toBeEnabled();
    });
  });
});
