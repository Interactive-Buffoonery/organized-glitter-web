import '@testing-library/jest-dom/vitest';
import type { CSSProperties, ReactNode } from 'react';
import { within } from '@testing-library/react';
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
import { findOwnedDialog, pasteIntoField } from '@/test-utils/scopedInteractions';
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

/** The drawer renders in a portal, so tests bind their queries to the dialog they just opened. */
function openedDrawer() {
  return screen.getByRole('dialog', { name: /edit coloring book/i });
}

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

  it('waits for auth before judging book ownership, then shows unavailable for another account', () => {
    authState.user = undefined;
    authState.isLoading = true;
    authState.initialCheckComplete = false;
    const { rerender } = renderWithProviders(
      <ColoringBookEditDrawer bookId="book-123" isOpen onOpenChange={vi.fn()} />
    );
    const drawer = within(openedDrawer());

    expect(drawer.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(drawer.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    authState.user = { id: 'another-user' };
    authState.isLoading = false;
    authState.initialCheckComplete = true;
    rerender(<ColoringBookEditDrawer bookId="book-123" isOpen onOpenChange={vi.fn()} />);
    const rerenderedDrawer = within(openedDrawer());

    expect(rerenderedDrawer.getByRole('status')).toHaveAttribute('aria-busy', 'false');
    expect(rerenderedDrawer.getByRole('button', { name: 'Save changes' })).toBeDisabled();
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
      const drawerElement = openedDrawer();
      const drawer = within(drawerElement);
      await pasteIntoField(user, drawer.getByLabelText('Notes'), 'Unsaved note');
      if (device === 'phone') {
        drawerPropsMock.mock.calls.at(-1)?.[0].onOpenChange(false);
      } else {
        await user.click(drawer.getByRole('button', { name: 'Cancel' }));
      }
      expect(confirm).toHaveBeenCalledOnce();
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(drawerElement).toBeInTheDocument();
      expect(openedDrawer()).toBe(drawerElement);
      confirm.mockRestore();
    }
  );

  it('recovers a stale edit and retries with the accepted revision', async () => {
    const user = userEvent.setup();
    updateBookMutateAsync
      .mockRejectedValueOnce({ status: 409 })
      .mockResolvedValueOnce({ book: { ...bookState.data, revision: 8 } });

    renderWithProviders(<ColoringBookEditDrawer bookId="book-123" isOpen onOpenChange={vi.fn()} />);
    const drawer = within(openedDrawer());

    await user.click(drawer.getByRole('button', { name: 'Save changes' }));
    expect(await drawer.findByRole('alert')).toHaveFocus();
    expect(updateBookMutateAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ bookId: 'book-123', expectedRevision: 0 })
    );

    await user.click(drawer.getByRole('button', { name: 'Keep my edits for a new save' }));
    await waitFor(() => expect(drawer.queryByRole('alert')).not.toBeInTheDocument());
    await waitFor(() => expect(drawer.getByRole('button', { name: 'Save changes' })).toHaveFocus());

    await user.click(drawer.getByRole('button', { name: 'Save changes' }));
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
    const drawer = within(openedDrawer());

    const archiveButton = drawer.getByRole('button', { name: /archive coloring book/i });
    await user.click(archiveButton);
    const confirmation = await findOwnedDialog(
      archiveButton,
      'Archive coloring book?',
      'alertdialog'
    );
    await user.click(confirmation.getByRole('button', { name: 'Archive' }));

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
    const drawer = within(openedDrawer());

    const deleteButton = drawer.getByRole('button', { name: /delete coloring book/i });
    await user.click(deleteButton);
    const confirmation = await findOwnedDialog(
      deleteButton,
      'Delete this coloring book?',
      'alertdialog'
    );
    await user.click(confirmation.getByRole('button', { name: 'Delete' }));

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
      const drawer = within(openedDrawer());
      await pasteIntoField(user, drawer.getByLabelText('Notes'), 'Unsaved private note');
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

      const actionButton = drawer.getByRole('button', {
        name: new RegExp(`${action} coloring book`, 'i'),
      });
      await user.click(actionButton);
      const confirmation = await findOwnedDialog(
        actionButton,
        action === 'archive' ? 'Archive coloring book?' : 'Delete this coloring book?',
        'alertdialog'
      );
      await user.click(
        confirmation.getByRole('button', { name: action === 'archive' ? 'Archive' : 'Delete' })
      );
      await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/dashboard?craft=coloring'));

      expect(readFormDraft(identity, generation, isColoringBookDraftValues).draft).toBeNull();
    }
  );
});
