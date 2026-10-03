import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent } from 'react';
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

const makeUploadEvent = (file: File): ChangeEvent<HTMLInputElement> => {
  const input = document.createElement('input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  return { target: input } as unknown as ChangeEvent<HTMLInputElement>;
};

const makeCommandExecutor = () => ({
  execute: executeMock,
  isPending: isPendingMock.current,
});

describe('useColoringPagePhotoManager', () => {
  beforeEach(() => {
    executeMock.mockReset().mockResolvedValue(makePage());
    isPendingMock.current = false;
  });

  it('opens crop dialog from upload', () => {
    const page = makePage();
    const { result } = renderHook(() => useColoringPagePhotoManager(page, makeCommandExecutor()));

    act(() => {
      result.current.handlePhotoUpload(
        makeUploadEvent(new File(['raw'], 'raw page.png', { type: 'image/png' }))
      );
    });

    expect(result.current.isPhotoCropDialogOpen).toBe(true);
    expect(result.current.photoCropFile?.name).toBe('raw-page.png');
  });

  it('submits cropped and original files through add-photos', async () => {
    const page = makePage({ photos: ['main.jpg'] });
    const { result } = renderHook(() => useColoringPagePhotoManager(page, makeCommandExecutor()));
    const croppedFile = new File(['cropped'], 'cropped.jpg', { type: 'image/jpeg' });
    const originalFile = new File(['original'], 'original.jpg', { type: 'image/jpeg' });

    act(() => {
      result.current.handlePhotoCropComplete(croppedFile);
      result.current.handlePhotoUseOriginal(originalFile);
    });

    await waitFor(() => expect(executeMock).toHaveBeenCalledTimes(2));
    expect(executeMock).toHaveBeenNthCalledWith(
      1,
      'page-1',
      { type: 'add-photos', files: [croppedFile] },
      { failureTitle: 'Photo upload failed' }
    );
    expect(executeMock).toHaveBeenNthCalledWith(
      2,
      'page-1',
      { type: 'add-photos', files: [originalFile] },
      { failureTitle: 'Photo upload failed' }
    );
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

  it('resets crop state when page id changes', async () => {
    const { result, rerender } = renderHook(
      ({ page }) => useColoringPagePhotoManager(page, makeCommandExecutor()),
      {
        initialProps: { page: makePage({ id: 'page-1' }) },
      }
    );

    act(() => {
      result.current.handlePhotoUpload(
        makeUploadEvent(new File(['raw'], 'raw-page.png', { type: 'image/png' }))
      );
    });

    expect(result.current.isPhotoCropDialogOpen).toBe(true);

    rerender({ page: makePage({ id: 'page-2' }) });

    await waitFor(() => expect(result.current.isPhotoCropDialogOpen).toBe(false));
    expect(result.current.photoCropFile).toBeNull();
  });
});
