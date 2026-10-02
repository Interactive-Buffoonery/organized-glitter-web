import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseColoringPageCommandExecutorResult } from '@/hooks/coloring/useColoringPageCommandExecutor';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import { useColoringPageCommand } from '../useColoringPageCommand';

const executeMock = vi.fn();

const commandExecutor: UseColoringPageCommandExecutorResult = {
  isPending: false,
  execute: executeMock,
};

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

describe('useColoringPageCommand', () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it('skips the command and returns null when there is no page', async () => {
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    const { result } = renderHook(() => useColoringPageCommand(commandExecutor));

    let returned: ColoringPageDTO | null = makePage();
    await act(async () => {
      returned = await result.current(
        null,
        { type: 'set-status', status: 'completed' },
        {
          failureTitle: 'Status update failed',
          onSuccess,
          onFailure,
        }
      );
    });

    expect(returned).toBeNull();
    expect(executeMock).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('runs onSuccess with the updated page when the command resolves', async () => {
    const page = makePage();
    const updatedPage = makePage({ status: 'completed' });
    executeMock.mockResolvedValue(updatedPage);
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    const { result } = renderHook(() => useColoringPageCommand(commandExecutor));

    let returned: ColoringPageDTO | null = null;
    await act(async () => {
      returned = await result.current(
        page,
        { type: 'set-status', status: 'completed' },
        {
          failureTitle: 'Status update failed',
          onSuccess,
          onFailure,
        }
      );
    });

    expect(executeMock).toHaveBeenCalledWith(
      'page-1',
      { type: 'set-status', status: 'completed' },
      { failureTitle: 'Status update failed' }
    );
    expect(returned).toBe(updatedPage);
    expect(onSuccess).toHaveBeenCalledWith(updatedPage);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('runs onFailure and returns null when the command resolves to null', async () => {
    const page = makePage();
    executeMock.mockResolvedValue(null);
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    const { result } = renderHook(() => useColoringPageCommand(commandExecutor));

    let returned: ColoringPageDTO | null = makePage();
    await act(async () => {
      returned = await result.current(
        page,
        { type: 'set-status', status: 'completed' },
        {
          failureTitle: 'Status update failed',
          onSuccess,
          onFailure,
        }
      );
    });

    expect(returned).toBeNull();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
