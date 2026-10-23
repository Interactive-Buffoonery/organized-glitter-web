import { Suspense, startTransition, useState, useLayoutEffect } from 'react';
import { render } from '@testing-library/react';
import { act } from '@testing-library/react';
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
