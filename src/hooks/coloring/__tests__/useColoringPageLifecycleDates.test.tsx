import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';

const { executeMock, isPendingMock, notifyMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  isPendingMock: { current: false },
  notifyMock: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  notify: notifyMock,
}));

import { useColoringPageLifecycleDates } from '../useColoringPageLifecycleDates';

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

describe('useColoringPageLifecycleDates', () => {
  beforeEach(() => {
    executeMock.mockReset().mockResolvedValue(makePage());
    notifyMock.mockReset();
    isPendingMock.current = false;
  });

  it('preserves an unsaved sibling draft when the saved field resyncs', async () => {
    const page = makePage();
    const { result, rerender } = renderHook(
      ({ currentPage }) => useColoringPageLifecycleDates(currentPage, 'UTC', makeCommandExecutor()),
      { initialProps: { currentPage: page } }
    );

    act(() => {
      result.current.setStartedAtDraft('2026-04-01');
      result.current.setCompletedAtDraft('2026-04-27');
    });

    await act(async () => {
      await result.current.saveStartedAt();
    });

    expect(executeMock).toHaveBeenCalledWith(
      'page-1',
      { type: 'set-started-date', startedAt: '2026-04-01' },
      { failureTitle: 'Date did not save' }
    );

    rerender({
      currentPage: makePage({ startedAt: '2026-04-01' }),
    });

    await waitFor(() => expect(result.current.startedAtDraft).toBe('2026-04-01'));
    expect(result.current.completedAtDraft).toBe('2026-04-27');
  });
});
