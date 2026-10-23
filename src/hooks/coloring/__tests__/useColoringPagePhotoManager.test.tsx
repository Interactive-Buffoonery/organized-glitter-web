import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';

const { executeMock, isPendingMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  isPendingMock: { current: false },
}));

import { useColoringPagePhotoManager } from '../useColoringPagePhotoManager';

const makePage = (overrides: Partial<ColoringPageDTO> = {}): ColoringPageDTO => ({
  id: 'page-1',
  bookId: 'book-1',
  pageNumber: 1,
  status: 'not_started',
  photos: ['main.jpg', 'detail.jpg', 'extra.jpg'],
  mediumIds: [],
  revealedSubject: '',
  revealedAt: '',
  startedAt: '',
  completedAt: '',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...overrides,
});

const makeCommandExecutor = () => ({
  execute: executeMock,
  isPending: isPendingMock.current,
});

describe('useColoringPagePhotoManager', () => {
  beforeEach(() => {
    executeMock.mockReset().mockResolvedValue(makePage());
    isPendingMock.current = false;
  });

  it('deletes photos and sets main photo with the latest returned photo ordering', async () => {
    const page = makePage();
    executeMock
      .mockResolvedValueOnce(makePage({ photos: ['main.jpg', 'extra.jpg'] }))
      .mockResolvedValueOnce(makePage({ photos: ['extra.jpg', 'main.jpg'] }));
    const { result } = renderHook(() => useColoringPagePhotoManager(page, makeCommandExecutor()));

    await act(async () => {
      await result.current.deletePhoto('detail.jpg');
      await result.current.setMainPhoto('extra.jpg');
    });

    expect(executeMock).toHaveBeenNthCalledWith(
      1,
      'page-1',
      {
        type: 'delete-photo',
        filename: 'detail.jpg',
      },
      { failureTitle: 'Photo delete failed' }
    );
    expect(executeMock).toHaveBeenNthCalledWith(
      2,
      'page-1',
      {
        type: 'set-main-photo',
        filename: 'extra.jpg',
      },
      { failureTitle: 'Main image did not update' }
    );
  });
});
