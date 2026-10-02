import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';

const { isPendingMock, mutateAsyncMock, notifyMock } = vi.hoisted(() => ({
  isPendingMock: { current: false },
  mutateAsyncMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock('@/hooks/mutations/coloring/useUpdateColoringPage', () => ({
  useUpdateColoringPage: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: isPendingMock.current,
  }),
}));

vi.mock('@/lib/notifications', () => ({
  notify: notifyMock,
}));

import { useColoringPageCommandExecutor } from '../useColoringPageCommandExecutor';

const makePage = (overrides: Partial<ColoringPageDTO> = {}): ColoringPageDTO => ({
  id: 'page-1',
  bookId: 'book-1',
  pageNumber: 1,
  status: 'not_started',
  photos: [],
  mediumIds: [],
  revealedSubject: '',
  revealedAt: '',
  startedAt: '',
  completedAt: '',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...overrides,
});

describe('useColoringPageCommandExecutor', () => {
  beforeEach(() => {
    isPendingMock.current = false;
    mutateAsyncMock.mockReset().mockResolvedValue(makePage({ status: 'completed' }));
    notifyMock.mockReset();
  });

  it('passes successful commands through to the page mutation', async () => {
    const { result } = renderHook(() => useColoringPageCommandExecutor());
    let updatedPage: ColoringPageDTO | null = null;

    await act(async () => {
      updatedPage = await result.current.execute(
        'page-1',
        { type: 'set-status', status: 'completed' },
        { failureTitle: 'Status update failed' }
      );
    });

    expect(updatedPage).toEqual(expect.objectContaining({ status: 'completed' }));
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      pageId: 'page-1',
      command: { type: 'set-status', status: 'completed' },
    });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('notifies and returns null when the page mutation fails', async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error('Nope'));
    const { result } = renderHook(() => useColoringPageCommandExecutor());
    let updatedPage: ColoringPageDTO | null = makePage();

    await act(async () => {
      updatedPage = await result.current.execute(
        'page-1',
        { type: 'set-status', status: 'completed' },
        { failureTitle: 'Status update failed' }
      );
    });

    expect(updatedPage).toBeNull();
    expect(notifyMock).toHaveBeenCalledWith({
      kind: 'error',
      title: 'Status update failed',
      description: 'Nope',
    });
  });
});
