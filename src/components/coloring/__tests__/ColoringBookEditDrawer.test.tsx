import '@testing-library/jest-dom/vitest';
import type { CSSProperties, ReactNode } from 'react';
import { vi } from 'vitest';
import {
  beforeEach,
  describe,
  expect,
  it,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from '@/test-utils';
import { getDraftGeneration, readFormDraft } from '@/hooks/drafts/formDraftStorage';
import { isColoringBookDraftValues } from '@/hooks/drafts/formDraftAdapters';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';

const {
  navigateMock,
  updateBookMutateAsync,
  refetchBookMock,
  deleteBookMutateAsync,
  createPublisherMutateAsync,
  createIllustratorMutateAsync,
  notifyMock,
  bookState,
  authState,
  coverUrlMock,
  drawerPropsMock,
  keyboardSafeViewportStyleMock,
  mobileDeviceMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  updateBookMutateAsync: vi.fn(),
  refetchBookMock: vi.fn(),
  deleteBookMutateAsync: vi.fn(),
  createPublisherMutateAsync: vi.fn(),
  createIllustratorMutateAsync: vi.fn(),
  notifyMock: vi.fn(),
  coverUrlMock: vi.fn(() => ''),
  drawerPropsMock: vi.fn(),
  keyboardSafeViewportStyleMock: vi.fn(() => ({
    bottom: '300px',
    height: '500px',
    maxHeight: '500px',
  })),
  mobileDeviceMock: vi.fn(() => ({
    isMobile: false,
    isPhone: false,
    isTouchDevice: false,
    isMobileAndTouch: false,
    isTablet: false,
    isLandscape: false,
    screenSize: 'lg',
    width: 1024,
    height: 768,
  })),
  bookState: {
    data: {
      id: 'book-123',
      userId: 'user-123',
      title: 'Worlds of Wonder',
      publisherId: 'pub-1',
      illustratorId: 'ill-1',
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
      totalPages: 100,
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      revision: 0,
    },
    isLoading: false,
  },
  authState: {
    user: { id: 'user-123' } as { id: string } | undefined,
    isLoading: false,
    initialCheckComplete: true,
  },
}));

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/use-mobile', () => ({
  useMobileDevice: mobileDeviceMock,
}));

vi.mock('@/hooks/useKeyboardSafeViewportStyle', () => ({
  useKeyboardSafeViewportStyle: keyboardSafeViewportStyleMock,
}));

vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children, ...props }: { children: ReactNode }) => {
    drawerPropsMock(props);
    return <div data-testid="phone-coloring-book-edit-drawer">{children}</div>;
  },
  DrawerContent: ({
    children,
    className,
    style,
  }: {
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
  }) => (
    <div
      role="dialog"
      aria-label="Edit coloring book"
      data-testid="phone-coloring-book-edit-drawer-content"
      className={className}
      style={style}
    >
      {children}
    </div>
  ),
  DrawerTitle: ({ children, className }: { children: ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
  DrawerDescription: ({ children, className }: { children: ReactNode; className?: string }) => (
    <p className={className}>{children}</p>
  ),
}));

vi.mock('@/hooks/queries/coloring/useColoringBook', () => ({
  useColoringBook: () => ({ ...bookState, refetch: refetchBookMock }),
}));

vi.mock('@/hooks/queries/coloring/useBookPublishers', () => ({
  useBookPublishers: () => ({ data: { items: [{ id: 'pub-1', name: 'Penguin' }] } }),
}));

vi.mock('@/hooks/queries/coloring/useBookIllustrators', () => ({
  useBookIllustrators: () => ({ data: { items: [{ id: 'ill-1', name: 'Jeremy Mariez' }] } }),
}));

vi.mock('@/hooks/mutations/coloring/useUpdateColoringBook', () => ({
  useUpdateColoringBook: () => ({
    mutateAsync: updateBookMutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/hooks/mutations/coloring/useDeleteColoringBook', () => ({
  useDeleteColoringBook: () => ({
    mutateAsync: deleteBookMutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/hooks/mutations/coloring/useCreateBookPublisher', () => ({
  useCreateBookPublisher: () => ({
    mutateAsync: createPublisherMutateAsync,
  }),
}));

vi.mock('@/hooks/mutations/coloring/useCreateBookIllustrator', () => ({
  useCreateBookIllustrator: () => ({
    mutateAsync: createIllustratorMutateAsync,
  }),
}));

vi.mock('@/services/pocketbase/coloring.service', () => ({
  ColoringService: {
    getCoverImageUrl: coverUrlMock,
  },
}));

vi.mock('@/services/pocketbase/coloringTags.service', () => ({
  ColoringTagService: {
    listColoringTags: async () => ({ status: 'success', data: [] }),
    createColoringTag: async () => ({ status: 'success', data: null }),
  },
}));

vi.mock('@/lib/notifications', () => ({
  notify: notifyMock,
}));

import ColoringBookEditDrawer from '../ColoringBookEditDrawer';

describe('ColoringBookEditDrawer', () => {
  beforeEach(() => {
    localStorage.clear();
    authState.user = { id: 'user-123' };
    authState.isLoading = false;
    authState.initialCheckComplete = true;
    navigateMock.mockReset();
    updateBookMutateAsync.mockReset().mockResolvedValue({ book: { ...bookState.data } });
    refetchBookMock.mockReset().mockResolvedValue({
      isError: false,
      data: { ...bookState.data, revision: 7 },
    });
    deleteBookMutateAsync.mockReset().mockResolvedValue(undefined);
    createPublisherMutateAsync.mockReset();
    createIllustratorMutateAsync.mockReset();
    notifyMock.mockReset();
    coverUrlMock.mockReset().mockReturnValue('');
    drawerPropsMock.mockClear();
    keyboardSafeViewportStyleMock.mockClear();
    mobileDeviceMock.mockReturnValue({
      isMobile: false,
      isPhone: false,
      isTouchDevice: false,
      isMobileAndTouch: false,
      isTablet: false,
      isLandscape: false,
      screenSize: 'lg',
      width: 1024,
      height: 768,
    });
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.setPointerCapture ??= vi.fn();
    Element.prototype.releasePointerCapture ??= vi.fn();
    Element.prototype.scrollIntoView ??= vi.fn();
  });

  it('renders the edit drawer with external footer actions', () => {
    renderWithProviders(<ColoringBookEditDrawer bookId="book-123" isOpen onOpenChange={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: /edit coloring book/i })).toBeInTheDocument();
    expect(screen.getByText(/Worlds of Wonder/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archive coloring book/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete coloring book/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute(
      'form',
      'coloring-book-edit-drawer-form'
    );
    expect(screen.getByTestId('coloring-book-form-layout')).not.toHaveClass(
      'lg:grid-cols-[minmax(0,1fr)_320px]'
    );
    expect(screen.getByTestId('coloring-book-drawer-status-tags')).toHaveClass(
      'grid',
      'md:grid-cols-2'
    );

    const statusHeading = screen.getByRole('heading', { name: 'Status' });
    const tagsHeading = screen.getByRole('heading', { name: 'Tags' });
    const coverHeading = screen.getByRole('heading', { name: 'Cover image' });

    expect(statusHeading.compareDocumentPosition(coverHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(tagsHeading.compareDocumentPosition(coverHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('waits for auth before judging book ownership, then shows unavailable for another account', () => {
    authState.user = undefined;
    authState.isLoading = true;
    authState.initialCheckComplete = false;
    const { rerender } = renderWithProviders(
      <ColoringBookEditDrawer bookId="book-123" isOpen onOpenChange={vi.fn()} />
    );

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    authState.user = { id: 'another-user' };
    authState.isLoading = false;
    authState.initialCheckComplete = true;
    rerender(<ColoringBookEditDrawer bookId="book-123" isOpen onOpenChange={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('keeps the phone drawer footer anchored to the keyboard-safe viewport', async () => {
    const user = userEvent.setup();
    mobileDeviceMock.mockReturnValue({
      isMobile: true,
      isPhone: true,
      isTouchDevice: true,
      isMobileAndTouch: true,
      isTablet: false,
      isLandscape: false,
      screenSize: 'xs-',
      width: 390,
      height: 844,
    });

    renderWithProviders(<ColoringBookEditDrawer bookId="book-123" isOpen onOpenChange={vi.fn()} />);

    expect(keyboardSafeViewportStyleMock).toHaveBeenCalledWith(true);
    expect(drawerPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        open: true,
        shouldScaleBackground: false,
        repositionInputs: false,
      })
    );

    const drawerContent = screen.getByTestId('phone-coloring-book-edit-drawer-content');
    expect(drawerContent).toHaveClass('flex', 'flex-col');
    expect(drawerContent).toHaveStyle({
      bottom: '300px',
      height: '500px',
      maxHeight: '500px',
    });

    await user.click(screen.getByLabelText(/Title/));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeVisible();
  });

  it.each(['phone', 'desktop'] as const)(
    'keeps a dirty %s edit open when dismissal is declined',
    async device => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      if (device === 'phone') {
        mobileDeviceMock.mockReturnValue({
          isMobile: true,
          isPhone: true,
          isTouchDevice: true,
          isMobileAndTouch: true,
          isTablet: false,
          isLandscape: false,
          screenSize: 'xs-',
          width: 390,
          height: 844,
        });
      }

      renderWithProviders(
        <ColoringBookEditDrawer bookId="book-123" isOpen onOpenChange={onOpenChange} />
      );
      await user.type(screen.getByLabelText('Notes'), 'Unsaved note');
      if (device === 'phone') {
        drawerPropsMock.mock.calls.at(-1)?.[0].onOpenChange(false);
      } else {
        await user.click(screen.getByRole('button', { name: 'Cancel' }));
      }
      expect(confirm).toHaveBeenCalledOnce();
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(screen.getByRole('dialog', { name: /edit coloring book/i })).toBeInTheDocument();
      confirm.mockRestore();
    }
  );

  it('omits unchanged page totals and closes after a successful metadata save', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();

    renderWithProviders(
      <ColoringBookEditDrawer
        bookId="book-123"
        isOpen
        onOpenChange={onOpenChange}
        onSaved={onSaved}
      />
    );

    await user.clear(screen.getByLabelText(/Title/));
    await user.type(screen.getByLabelText(/Title/), 'Updated Worlds');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(updateBookMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          bookId: 'book-123',
          expectedRevision: 0,
          patch: expect.objectContaining({
            title: 'Updated Worlds',
            status: 'purchased',
          }),
        })
      );
      expect(updateBookMutateAsync.mock.calls[0][0].patch).not.toHaveProperty('total_pages');
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('shows the server reduction reason when a save is rejected', async () => {
    const user = userEvent.setup();
    updateBookMutateAsync.mockRejectedValue({
      type: 'validation',
      message: 'Total pages cannot be less than 900 because that page has saved work.',
      retryable: false,
    });

    renderWithProviders(<ColoringBookEditDrawer bookId="book-123" isOpen onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith({
        kind: 'error',
        title: 'Could not update coloring book',
        description: 'Total pages cannot be less than 900 because that page has saved work.',
      });
    });
  });

  it('recovers a stale edit and retries with the accepted revision', async () => {
    const user = userEvent.setup();
    updateBookMutateAsync
      .mockRejectedValueOnce({ status: 409 })
      .mockResolvedValueOnce({ book: { ...bookState.data, revision: 8 } });

    renderWithProviders(<ColoringBookEditDrawer bookId="book-123" isOpen onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveFocus();
    expect(updateBookMutateAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ bookId: 'book-123', expectedRevision: 0 })
    );

    await user.click(screen.getByRole('button', { name: 'Keep my edits for a new save' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(updateBookMutateAsync).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ bookId: 'book-123', expectedRevision: 7 })
      )
    );
  });

  it('archives the coloring book from the footer after confirmation', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ColoringBookEditDrawer bookId="book-123" isOpen onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /archive coloring book/i }));
    await user.click(await screen.findByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(updateBookMutateAsync).toHaveBeenCalledWith({
        bookId: 'book-123',
        patch: { status: 'archived' },
      });
      expect(navigateMock).toHaveBeenCalledWith('/dashboard?craft=coloring');
    });
  });

  it('deletes the coloring book from the footer after confirmation', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ColoringBookEditDrawer bookId="book-123" isOpen onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /delete coloring book/i }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(deleteBookMutateAsync).toHaveBeenCalledWith('book-123');
      expect(navigateMock).toHaveBeenCalledWith('/dashboard?craft=coloring');
    });
  });

  it.each(['archive', 'delete'] as const)(
    'removes an unfinished coloring draft after successful %s',
    async action => {
      const user = userEvent.setup();
      renderWithProviders(
        <ColoringBookEditDrawer bookId="book-123" isOpen onOpenChange={vi.fn()} />
      );
      await user.type(screen.getByLabelText('Notes'), 'Unsaved private note');
      const identity = {
        backendUrl: POCKETBASE_URL,
        accountId: 'user-123',
        kind: 'coloring-book-edit' as const,
        recordId: 'book-123',
      };
      const generation = getDraftGeneration(identity)!;
      await waitFor(
        () =>
          expect(
            readFormDraft(identity, generation, isColoringBookDraftValues).draft
          ).not.toBeNull(),
        { timeout: 2000 }
      );

      await user.click(
        screen.getByRole('button', { name: new RegExp(`${action} coloring book`, 'i') })
      );
      await user.click(
        await screen.findByRole('button', { name: action === 'archive' ? 'Archive' : 'Delete' })
      );
      await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/dashboard?craft=coloring'));

      expect(readFormDraft(identity, generation, isColoringBookDraftValues).draft).toBeNull();
    }
  );
});
