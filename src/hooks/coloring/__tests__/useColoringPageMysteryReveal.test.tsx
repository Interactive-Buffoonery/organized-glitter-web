import { Suspense, startTransition, useState, useLayoutEffect } from 'react';
import { render } from '@testing-library/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';

const { executeMock, isPendingMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  isPendingMock: { current: false },
}));

import { useColoringPageMysteryReveal } from '../useColoringPageMysteryReveal';

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

describe('useColoringPageMysteryReveal', () => {
  beforeEach(() => {
    executeMock.mockReset().mockResolvedValue(makePage({ revealedSubject: 'Dragon' }));
    isPendingMock.current = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts, cancels, and submits reveal editing', async () => {
    const page = makePage({ revealedSubject: 'Castle' });
    const { result } = renderHook(() => useColoringPageMysteryReveal(page, makeCommandExecutor()));

    act(() => {
      result.current.startRevealEditing();
    });

    expect(result.current.isEditingReveal).toBe(true);
    expect(result.current.revealedSubject).toBe('Castle');

    act(() => {
      result.current.setRevealedSubject('Dragon');
      result.current.cancelRevealEditing();
    });

    expect(result.current.isEditingReveal).toBe(false);
    expect(result.current.revealedSubject).toBe('Castle');

    act(() => {
      result.current.startRevealEditing();
      result.current.setRevealedSubject('Dragon');
    });

    await act(async () => {
      await result.current.submitReveal();
    });

    expect(result.current.isEditingReveal).toBe(false);
    expect(executeMock).toHaveBeenCalledWith(
      'page-1',
      expect.objectContaining({
        type: 'reveal-mystery',
        revealedSubject: 'Dragon',
      }),
      { failureTitle: 'Reveal failed' }
    );
  });

  it('sends trimmed subject and ISO timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T16:20:00.000Z'));
    const page = makePage();
    const { result } = renderHook(() => useColoringPageMysteryReveal(page, makeCommandExecutor()));

    act(() => {
      result.current.startRevealEditing();
      result.current.setRevealedSubject('  Dragon  ');
    });

    await act(async () => {
      await result.current.submitReveal();
    });

    expect(executeMock).toHaveBeenCalledWith(
      'page-1',
      {
        type: 'reveal-mystery',
        revealedSubject: 'Dragon',
        revealedAt: '2026-05-17T16:20:00.000Z',
      },
      { failureTitle: 'Reveal failed' }
    );
  });

  it('submits the latest draft when save follows a same-tick edit', async () => {
    const page = makePage();
    const { result } = renderHook(() => useColoringPageMysteryReveal(page, makeCommandExecutor()));

    act(() => {
      result.current.startRevealEditing();
    });

    await act(async () => {
      result.current.setRevealedSubject('Dragon');
      await result.current.submitReveal();
    });

    expect(executeMock).toHaveBeenCalledWith(
      'page-1',
      expect.objectContaining({
        type: 'reveal-mystery',
        revealedSubject: 'Dragon',
      }),
      { failureTitle: 'Reveal failed' }
    );
  });

  it('clears reveal state when marking a page unrevealed', async () => {
    const page = makePage({
      revealedSubject: 'Dragon',
      revealedAt: '2026-05-17T16:20:00.000Z',
    });
    const { result } = renderHook(() => useColoringPageMysteryReveal(page, makeCommandExecutor()));

    act(() => {
      result.current.startRevealEditing();
      result.current.setRevealedSubject('Draft');
    });

    await act(async () => {
      await result.current.clearReveal();
    });

    expect(result.current.isEditingReveal).toBe(false);
    expect(result.current.revealedSubject).toBe('');
    expect(executeMock).toHaveBeenCalledWith(
      'page-1',
      { type: 'clear-mystery-reveal' },
      { failureTitle: 'Could not mark unrevealed' }
    );
  });

  it('resets stale reveal draft and edit mode when page id changes', async () => {
    const { result, rerender } = renderHook(
      ({ page }) => useColoringPageMysteryReveal(page, makeCommandExecutor()),
      {
        initialProps: { page: makePage({ id: 'page-1' }) },
      }
    );

    act(() => {
      result.current.startRevealEditing();
      result.current.setRevealedSubject('Stale draft');
    });

    rerender({ page: makePage({ id: 'page-2', revealedSubject: 'Castle' }) });

    await waitFor(() => expect(result.current.isEditingReveal).toBe(false));
    expect(result.current.revealedSubject).toBe('Castle');
  });

  it('submits the new page reveal when save follows a page id change in the same tick', async () => {
    const { result, rerender } = renderHook(
      ({ page }) => useColoringPageMysteryReveal(page, makeCommandExecutor()),
      {
        initialProps: { page: makePage({ id: 'page-1', revealedSubject: 'Dragon' }) },
      }
    );

    act(() => {
      result.current.startRevealEditing();
      result.current.setRevealedSubject('Stale draft');
    });

    rerender({ page: makePage({ id: 'page-2', revealedSubject: 'Castle' }) });

    await act(async () => {
      await result.current.submitReveal();
    });

    expect(executeMock).toHaveBeenCalledWith(
      'page-2',
      expect.objectContaining({
        type: 'reveal-mystery',
        revealedSubject: 'Castle',
      }),
      { failureTitle: 'Reveal failed' }
    );
  });

  it('resets the draft when a same-tick page change keeps the committed subject', async () => {
    const page = makePage({ revealedSubject: 'Castle' });
    let update!: (value: ColoringPageDTO) => void;
    let current!: ReturnType<typeof useColoringPageMysteryReveal>;
    const Harness = () => {
      const [currentPage, setCurrentPage] = useState(page);
      update = setCurrentPage;
      const reveal = useColoringPageMysteryReveal(currentPage, makeCommandExecutor());
      useLayoutEffect(() => {
        current = reveal;
      });
      return null;
    };
    render(<Harness />);
    act(() => current.startRevealEditing());

    act(() => {
      current.setRevealedSubject('Uncommitted draft');
      update(makePage({ id: 'page-2', revealedSubject: 'Castle' }));
    });
    expect(current.revealedSubject).toBe('Castle');
    await act(async () => {
      await current.submitReveal();
    });
    expect(executeMock).toHaveBeenCalledWith(
      'page-2',
      expect.objectContaining({ revealedSubject: 'Castle' }),
      { failureTitle: 'Reveal failed' }
    );
  });

  it('submits the visible page draft while a different page render is suspended', async () => {
    const pending = new Promise<void>(() => {});
    let update!: (page: ColoringPageDTO) => void;
    let current!: ReturnType<typeof useColoringPageMysteryReveal>;
    let attempted = false;
    const Suspend = ({ active }: { active: boolean }) => {
      if (active) {
        attempted = true;
        throw pending;
      }
      return null;
    };
    const Reveal = ({ page }: { page: ColoringPageDTO }) => {
      const reveal = useColoringPageMysteryReveal(page, makeCommandExecutor());
      // Publish only committed handlers, like the visible Save button.
      useLayoutEffect(() => {
        current = reveal;
      });
      return null;
    };
    const Harness = () => {
      const [page, setPage] = useState(makePage());
      update = setPage;
      return (
        <>
          <Reveal page={page} />
          <Suspend active={page.id === 'page-2'} />
        </>
      );
    };
    render(
      <Suspense fallback="Loading">
        <Harness />
      </Suspense>
    );
    act(() => {
      current.startRevealEditing();
      current.setRevealedSubject('Visible draft');
    });
    await act(async () => {
      startTransition(() => update(makePage({ id: 'page-2', revealedSubject: 'Other page' })));
    });
    expect(attempted).toBe(true);
    await act(async () => {
      await current.submitReveal();
    });
    expect(executeMock).toHaveBeenCalledWith(
      'page-1',
      expect.objectContaining({ revealedSubject: 'Visible draft' }),
      { failureTitle: 'Reveal failed' }
    );
    act(() => update(makePage()));
  });
});
