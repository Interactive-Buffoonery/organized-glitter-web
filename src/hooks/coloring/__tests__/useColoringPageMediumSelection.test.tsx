import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';

const { executeMock, isPendingMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  isPendingMock: { current: false },
}));

import { useColoringPageMediumSelection } from '../useColoringPageMediumSelection';

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

const makeCommandExecutor = () => ({
  execute: executeMock,
  isPending: isPendingMock.current,
});

describe('useColoringPageMediumSelection', () => {
  beforeEach(() => {
    executeMock.mockReset().mockResolvedValue(makePage({ mediumIds: ['medium-1'] }));
    isPendingMock.current = false;
  });

  it('saves selected medium ids', async () => {
    const page = makePage();
    const { result } = renderHook(() =>
      useColoringPageMediumSelection(page, makeCommandExecutor())
    );

    await act(async () => {
      await result.current.toggleMedium('medium-1', true);
    });

    expect(result.current.selectedMediumIds).toEqual(['medium-1']);
    expect(executeMock).toHaveBeenCalledWith(
      'page-1',
      { type: 'set-mediums', mediumIds: ['medium-1'] },
      { failureTitle: 'Mediums did not save' }
    );
  });

  it('rolls back local selection on mutation failure', async () => {
    executeMock.mockResolvedValueOnce(null);
    const page = makePage({ mediumIds: ['existing-medium'] });
    const { result } = renderHook(() =>
      useColoringPageMediumSelection(page, makeCommandExecutor())
    );

    await waitFor(() => expect(result.current.selectedMediumIds).toEqual(['existing-medium']));

    await act(async () => {
      await result.current.toggleMedium('medium-1', true);
    });

    expect(result.current.selectedMediumIds).toEqual(['existing-medium']);
  });

  it('resets selection when navigating to a different page id', async () => {
    const { result, rerender } = renderHook(
      ({ page }) => useColoringPageMediumSelection(page, makeCommandExecutor()),
      {
        initialProps: { page: makePage({ id: 'page-1', mediumIds: ['medium-1'] }) },
      }
    );

    await waitFor(() => expect(result.current.selectedMediumIds).toEqual(['medium-1']));

    rerender({ page: makePage({ id: 'page-2', mediumIds: ['medium-2'] }) });

    await waitFor(() => expect(result.current.selectedMediumIds).toEqual(['medium-2']));
  });

  it('accumulates rapid toggles before React rerenders', async () => {
    const page = makePage();
    const { result } = renderHook(() =>
      useColoringPageMediumSelection(page, makeCommandExecutor())
    );

    await act(async () => {
      const firstToggle = result.current.toggleMedium('medium-1', true);
      const secondToggle = result.current.toggleMedium('medium-2', true);
      await Promise.all([firstToggle, secondToggle]);
    });

    expect(result.current.selectedMediumIds).toEqual(['medium-1', 'medium-2']);
    expect(executeMock).toHaveBeenNthCalledWith(
      1,
      'page-1',
      { type: 'set-mediums', mediumIds: ['medium-1'] },
      { failureTitle: 'Mediums did not save' }
    );
    expect(executeMock).toHaveBeenNthCalledWith(
      2,
      'page-1',
      { type: 'set-mediums', mediumIds: ['medium-1', 'medium-2'] },
      { failureTitle: 'Mediums did not save' }
    );
  });
});
