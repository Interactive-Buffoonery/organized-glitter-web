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

  it('syncs drafts from page dates', async () => {
    const page = makePage({ startedAt: '2026-04-01', completedAt: '2026-04-27' });
    const { result, rerender } = renderHook(
      ({ currentPage }) => useColoringPageLifecycleDates(currentPage, 'UTC', makeCommandExecutor()),
      { initialProps: { currentPage: page } }
    );

    await waitFor(() => expect(result.current.startedAtDraft).toBe('2026-04-01'));
    expect(result.current.completedAtDraft).toBe('2026-04-27');

    rerender({
      currentPage: makePage({
        id: 'page-2',
        startedAt: '2026-05-01',
        completedAt: '',
      }),
    });

    await waitFor(() => expect(result.current.startedAtDraft).toBe('2026-05-01'));
    expect(result.current.completedAtDraft).toBe('');
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

  it('saves started and completed dates', async () => {
    const page = makePage();
    const { result } = renderHook(() =>
      useColoringPageLifecycleDates(page, 'UTC', makeCommandExecutor())
    );

    act(() => {
      result.current.setStartedAtDraft('2026-04-01');
      result.current.setCompletedAtDraft('2026-04-27');
    });

    await act(async () => {
      await result.current.saveStartedAt();
      await result.current.saveCompletedAt();
    });

    expect(executeMock).toHaveBeenNthCalledWith(
      1,
      'page-1',
      { type: 'set-started-date', startedAt: '2026-04-01' },
      { failureTitle: 'Date did not save' }
    );
    expect(executeMock).toHaveBeenNthCalledWith(
      2,
      'page-1',
      { type: 'set-completed-date', completedAt: '2026-04-27' },
      { failureTitle: 'Date did not save' }
    );
  });

  it('rejects completed-before-started before mutation', async () => {
    const page = makePage({ startedAt: '2026-04-10' });
    const { result } = renderHook(() =>
      useColoringPageLifecycleDates(page, 'UTC', makeCommandExecutor())
    );

    act(() => {
      result.current.setCompletedAtDraft('2026-04-01');
    });

    await act(async () => {
      await result.current.saveCompletedAt();
    });

    expect(executeMock).not.toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalledWith({
      kind: 'error',
      title: 'Date range is not possible',
      description: 'Completed date cannot be before started date.',
    });
  });

  it('clears existing dates', async () => {
    const page = makePage({ startedAt: '2026-04-01', completedAt: '2026-04-27' });
    const { result } = renderHook(() =>
      useColoringPageLifecycleDates(page, 'UTC', makeCommandExecutor())
    );

    await waitFor(() => expect(result.current.startedAtDraft).toBe('2026-04-01'));

    await act(async () => {
      await result.current.clearStartedAt();
      await result.current.clearCompletedAt();
    });

    expect(executeMock).toHaveBeenNthCalledWith(
      1,
      'page-1',
      { type: 'set-started-date', startedAt: '' },
      { failureTitle: 'Date did not save' }
    );
    expect(executeMock).toHaveBeenNthCalledWith(
      2,
      'page-1',
      { type: 'set-completed-date', completedAt: '' },
      { failureTitle: 'Date did not save' }
    );
  });

  it('uses same-render cleared drafts when validating the remaining date', async () => {
    const page = makePage({ startedAt: '2026-04-10', completedAt: '2026-04-11' });
    const { result } = renderHook(() =>
      useColoringPageLifecycleDates(page, 'UTC', makeCommandExecutor())
    );

    await waitFor(() => expect(result.current.startedAtDraft).toBe('2026-04-10'));

    act(() => {
      result.current.setCompletedAtDraft('2026-04-01');
    });

    await act(async () => {
      const startedAtClear = result.current.clearStartedAt();
      const completedAtSave = result.current.saveCompletedAt();
      await Promise.all([startedAtClear, completedAtSave]);
    });

    expect(notifyMock).not.toHaveBeenCalled();
    expect(executeMock).toHaveBeenNthCalledWith(
      1,
      'page-1',
      { type: 'set-started-date', startedAt: '' },
      { failureTitle: 'Date did not save' }
    );
    expect(executeMock).toHaveBeenNthCalledWith(
      2,
      'page-1',
      { type: 'set-completed-date', completedAt: '2026-04-01' },
      { failureTitle: 'Date did not save' }
    );
  });
});
