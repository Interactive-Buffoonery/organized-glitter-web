import '@testing-library/jest-dom/vitest';
import React from 'react';
import { within } from '@testing-library/react';
import { vi } from 'vitest';
import {
  beforeEach,
  act,
  createTestQueryClient,
  describe,
  expect,
  it,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from '@/test-utils';
import {
  captureSessionDrafts,
  clearSessionDrafts,
  recordCompletedSessionCreate,
  peekCompletedSessionDestinations,
  SessionChangedError,
} from '@/services/auth/sessionRecovery';

const {
  navigateMock,
  createBookMutateAsync,
  notifyMock,
  loggerErrorMock,
  createPublisherMutateAsync,
  createIllustratorMutateAsync,
  authState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  createBookMutateAsync: vi.fn(),
  notifyMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  createPublisherMutateAsync: vi.fn(),
  createIllustratorMutateAsync: vi.fn(),
  authState: { user: { id: 'user-123' } as { id: string } | null },
}));

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/queries/coloring/useBookPublishers', () => ({
  useBookPublishers: () => ({ data: { items: [{ id: 'pub-1', name: 'Penguin' }] } }),
}));

vi.mock('@/hooks/queries/coloring/useBookIllustrators', () => ({
  useBookIllustrators: () => ({ data: { items: [{ id: 'ill-1', name: 'Jeremy Mariez' }] } }),
}));

vi.mock('@/hooks/mutations/coloring/useCreateColoringBook', () => ({
  useCreateColoringBook: () => ({
    mutateAsync: createBookMutateAsync,
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

vi.mock('@/services/pocketbase/coloringTags.service', () => ({
  ColoringTagService: {
    listColoringTags: async () => ({
      status: 'success',
      data: [
        {
          id: 'coloring-tag-1',
          userId: 'user-123',
          name: 'Cozy',
          slug: 'cozy',
          color: '#14b8a6',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }),
    createColoringTag: async () => ({ status: 'success', data: null }),
  },
}));

vi.mock('@/lib/notifications', () => ({
  notify: notifyMock,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock,
    debug: vi.fn(),
    secureInfo: vi.fn(),
    criticalError: vi.fn(),
    group: vi.fn(),
    groupEnd: vi.fn(),
    groupCollapsed: vi.fn(),
    table: vi.fn(),
  }),
}));

import NewColoringBook from '../NewColoringBook';

describe('NewColoringBook page', () => {
  beforeEach(() => {
    clearSessionDrafts();
    localStorage.clear();
    navigateMock.mockReset();
    createBookMutateAsync
      .mockReset()
      .mockResolvedValue({ book: { id: 'book-123', title: 'Worlds' } });
    notifyMock.mockReset();
    loggerErrorMock.mockReset();
    createPublisherMutateAsync.mockReset();
    createIllustratorMutateAsync.mockReset();
    authState.user = { id: 'user-123' };
  });

  it('keeps a created book link across account reset until it is opened', async () => {
    captureSessionDrafts('user-123', 'late-book-token');
    const { rerender } = renderWithProviders(<NewColoringBook />);
    expect(screen.queryByRole('alert', { name: 'Late coloring book creation' })).toBeNull();

    act(() => recordCompletedSessionCreate('late-book-token', 'coloring_books', 'book-1'));

    expect(
      within(screen.getByRole('alert', { name: 'Late coloring book creation' })).getByRole('link')
    ).toHaveAttribute('href', '/coloring/book-1');
    expect(navigateMock).not.toHaveBeenCalled();

    clearSessionDrafts();
    authState.user = null;
    rerender(<NewColoringBook />);
    authState.user = { id: 'user-123' };
    rerender(<NewColoringBook />);
    const link = within(
      screen.getByRole('alert', { name: 'Late coloring book creation' })
    ).getByRole('link');
    await userEvent.setup().click(link);
    expect(peekCompletedSessionDestinations('user-123', '/coloring/')).toEqual([]);
  });

  it('keeps the create form open after a late tag response changes the session', async () => {
    const user = userEvent.setup();
    createBookMutateAsync.mockRejectedValue(new SessionChangedError());
    renderWithProviders(<NewColoringBook />);

    await user.type(screen.getByLabelText(/Title/), 'Worlds');
    await user.click(screen.getByRole('button', { name: 'Add book' }));

    await waitFor(() =>
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'warning', title: 'Session changed while adding book' })
      )
    );
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Title/)).toHaveValue('Worlds');
  });

  it('still navigates when post-create cache invalidation fails', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    const cacheError = new Error('cache failed');
    vi.spyOn(queryClient, 'invalidateQueries').mockRejectedValue(cacheError);

    renderWithProviders(<NewColoringBook />, { queryClient });

    await user.type(screen.getByLabelText(/Title/), 'Worlds');
    await user.click(screen.getByRole('button', { name: 'Add book' }));

    await waitFor(() => {
      expect(createBookMutateAsync).toHaveBeenCalledTimes(1);
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'success',
          title: 'Coloring book added',
        })
      );
      expect(notifyMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'error',
          title: 'Could not add coloring book',
        })
      );
      expect(loggerErrorMock).toHaveBeenCalledWith(
        'Post-create coloring book cache invalidation failed',
        expect.objectContaining({
          index: expect.any(Number),
          reason: cacheError,
        })
      );
      expect(navigateMock).toHaveBeenCalledWith('/coloring/book-123');
    });
  });
});
