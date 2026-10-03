import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  renderHookWithProviders,
  renderWithProviders,
  screen,
  waitFor,
} from '@/test-utils';
import { RandomizerResultPanel } from '@/components/randomizer/RandomizerResultPanel';
import { useRandomizer } from '../useRandomizer';
import type { RandomizerTarget } from '@/types/randomizer';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    useAuth: vi.fn(),
    useUserTimezone: vi.fn(),
    useEnabledVerticals: vi.fn(),
    useRandomizerNextUp: vi.fn(),
    useRandomizerTargets: vi.fn(),
    useRandomizerHasTargets: vi.fn(),
    useSpinHistoryCount: vi.fn(),
    useCreateSpin: vi.fn(),
    useSaveRandomizerNextUp: vi.fn(),
    useUpdateSpinMetadata: vi.fn(),
    useAddProgressNoteMutation: vi.fn(),
    useAddColoringPageProgressNoteMutation: vi.fn(),
    listColoringPageTargets: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock('@/hooks/useUserTimezone', () => ({
  useUserTimezone: () => mocks.useUserTimezone(),
}));

vi.mock('@/hooks/useEnabledVerticals', () => ({
  useEnabledVerticals: (userId: string | undefined) => mocks.useEnabledVerticals(userId),
}));

vi.mock('@/hooks/queries/useRandomizerTargets', () => ({
  useRandomizerTargets: (args: unknown) => mocks.useRandomizerTargets(args),
  useRandomizerHasTargets: (args: unknown) => mocks.useRandomizerHasTargets(args),
}));

vi.mock('@/hooks/queries/useRandomizerNextUp', () => ({
  useRandomizerNextUp: (userId: string | undefined) => mocks.useRandomizerNextUp(userId),
}));

vi.mock('@/hooks/queries/useSpinHistoryCount', () => ({
  useSpinHistoryCount: (args: unknown) => mocks.useSpinHistoryCount(args),
}));

vi.mock('@/hooks/mutations/useCreateSpin', () => ({
  useCreateSpin: () => mocks.useCreateSpin(),
}));

vi.mock('@/hooks/mutations/useSaveRandomizerNextUp', () => ({
  useSaveRandomizerNextUp: (userId: string | undefined) => mocks.useSaveRandomizerNextUp(userId),
}));

vi.mock('@/hooks/mutations/useUpdateSpinMetadata', () => ({
  useUpdateSpinMetadata: () => mocks.useUpdateSpinMetadata(),
}));

vi.mock('@/hooks/mutations/useProjectDetailMutations', () => ({
  useAddProgressNoteMutation: () => mocks.useAddProgressNoteMutation(),
}));

vi.mock('@/hooks/mutations/coloring/useColoringPageProgressNotes', () => ({
  useAddColoringPageProgressNoteMutation: () => mocks.useAddColoringPageProgressNoteMutation(),
}));

vi.mock('@/services/pocketbase/randomizerTargets.service', () => ({
  RandomizerTargetsService: {
    listColoringPageTargets: (...args: unknown[]) => mocks.listColoringPageTargets(...args),
  },
}));

const diamondTarget: RandomizerTarget = {
  id: 'project12345678',
  mode: 'diamond',
  targetType: 'diamond_project',
  title: 'Aurora Wolves',
  subtitle: 'Moonlight Co.',
  href: '/projects/project12345678',
  statusLabel: 'In progress',
  selectedMetadata: {},
};

const coloringBookTarget: RandomizerTarget = {
  id: 'book1234567890',
  mode: 'coloring-book',
  targetType: 'coloring_book',
  title: 'Garden Pages',
  subtitle: 'Indie Press',
  href: '/coloring/book1234567890',
  statusLabel: 'In progress',
  selectedMetadata: { coloringBook: 'book1234567890' },
};

const coloringPageTarget: RandomizerTarget = {
  id: 'page1234567890',
  mode: 'coloring-page',
  targetType: 'coloring_page',
  title: 'Garden Pages, page 7',
  subtitle: 'Garden Pages',
  href: '/coloring/book1234567890/pages/page1234567890',
  statusLabel: 'Palette chosen',
  selectedMetadata: {
    coloringPage: 'page1234567890',
    coloringBook: 'book1234567890',
  },
};

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
};

describe('useRandomizer', () => {
  const createSpinMutateAsync = vi.fn();
  const saveRandomizerNextUpMutateAsync = vi.fn();
  const updateSpinMetadataMutateAsync = vi.fn();
  const addProgressNoteMutateAsync = vi.fn();
  const addColoringPageProgressNoteMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');

    mocks.useAuth.mockReturnValue({
      user: { id: 'user12345678901', email: 'test@example.com' },
    });
    mocks.useUserTimezone.mockReturnValue('America/New_York');
    mocks.useEnabledVerticals.mockReturnValue({
      diamond_painting: true,
      coloring_books: true,
      isLoading: false,
    });
    mocks.useRandomizerTargets.mockReturnValue({
      data: [diamondTarget, { ...diamondTarget, id: 'project23456789', title: 'Beta' }],
      isLoading: false,
      error: null,
    });
    mocks.useRandomizerHasTargets.mockReturnValue({ data: false, isFetching: false, error: null });
    mocks.useRandomizerNextUp.mockReturnValue({
      data: { version: 1, targets: {} },
    });
    mocks.useSpinHistoryCount.mockReturnValue({ data: 0 });
    mocks.useCreateSpin.mockReturnValue({
      mutateAsync: createSpinMutateAsync,
      isPending: false,
      error: null,
    });
    mocks.useSaveRandomizerNextUp.mockReturnValue({
      mutateAsync: saveRandomizerNextUpMutateAsync,
      isPending: false,
    });
    mocks.useUpdateSpinMetadata.mockReturnValue({
      mutateAsync: updateSpinMetadataMutateAsync,
      isPending: false,
    });
    mocks.useAddProgressNoteMutation.mockReturnValue({
      mutateAsync: addProgressNoteMutateAsync,
      isPending: false,
    });
    mocks.useAddColoringPageProgressNoteMutation.mockReturnValue({
      mutateAsync: addColoringPageProgressNoteMutateAsync,
      isPending: false,
    });
    mocks.listColoringPageTargets.mockResolvedValue([]);
    createSpinMutateAsync.mockResolvedValue({
      id: 'spin12345678901',
      metadata: null,
    });
    saveRandomizerNextUpMutateAsync.mockResolvedValue({});
    updateSpinMetadataMutateAsync.mockResolvedValue({});
    addProgressNoteMutateAsync.mockResolvedValue({});
    addColoringPageProgressNoteMutateAsync.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['add', 'remove'] as const)(
    'preserves the completed result when a background refresh %ss another eligible target',
    async change => {
      const { result, rerender } = renderHookWithProviders(() => useRandomizer());
      await act(async () => {
        await result.current.handleSpinComplete(diamondTarget);
      });
      const section = { kind: 'number' as const, number: 8, candidates: [2, 8] };
      await act(async () => {
        await result.current.handleSectionChange(section);
      });
      const refreshed =
        change === 'add'
          ? [
              diamondTarget,
              { ...diamondTarget, id: 'project23456789', title: 'Beta' },
              { ...diamondTarget, id: 'project34567890', title: 'Gamma' },
            ]
          : [diamondTarget];
      mocks.useRandomizerTargets.mockReturnValue({
        data: refreshed,
        isLoading: false,
        error: null,
      });
      rerender();
      await waitFor(() => expect(result.current.selectedTargetIds.size).toBe(refreshed.length));
      expect(result.current.lastSpinResult).toEqual(diamondTarget);
      expect(result.current.sectionDraft).toEqual(section);
      const replacement = { ...section, number: 2 };
      await act(async () => {
        await result.current.handleSectionChange(replacement);
      });
      expect(updateSpinMetadataMutateAsync).toHaveBeenLastCalledWith(
        expect.objectContaining({
          spinId: 'spin12345678901',
          metadata: expect.objectContaining({ section: replacement }),
        })
      );
      act(() => {
        result.current.toggleTarget(diamondTarget.id);
      });
      expect(result.current.lastSpinResult).toBeNull();
      expect(result.current.sectionDraft).toBeNull();
    }
  );

  it.each(['add', 'remove'] as const)(
    'rejects an active completion after membership %s and restoration of the original pool',
    async change => {
      const original = [diamondTarget, { ...diamondTarget, id: 'project23456789', title: 'Beta' }];
      const { result, rerender } = renderHookWithProviders(() => useRandomizer());
      const interruptedCompletion = result.current.handleSpinComplete;
      const refreshed =
        change === 'add'
          ? [...original, { ...diamondTarget, id: 'project34567890', title: 'Gamma' }]
          : [diamondTarget];
      mocks.useRandomizerTargets.mockReturnValue({
        data: refreshed,
        isLoading: false,
        error: null,
      });
      rerender();
      await waitFor(() => expect(result.current.selectedTargetIds.size).toBe(refreshed.length));
      await act(async () => {
        await interruptedCompletion(diamondTarget);
      });
      expect(createSpinMutateAsync).not.toHaveBeenCalled();
      mocks.useRandomizerTargets.mockReturnValue({ data: original, isLoading: false, error: null });
      rerender();
      await waitFor(() => expect(result.current.selectedTargetIds.size).toBe(original.length));
      await act(async () => {
        await interruptedCompletion(diamondTarget);
      });
      expect(createSpinMutateAsync).not.toHaveBeenCalled();
      await act(async () => {
        await result.current.handleSpinComplete(diamondTarget);
      });
      expect(createSpinMutateAsync).toHaveBeenCalledTimes(1);
    }
  );

  it('retains the historical result snapshot when its target leaves the eligible pool', async () => {
    const { result, rerender } = renderHookWithProviders(() => useRandomizer());
    await act(async () => {
      await result.current.handleSpinComplete(diamondTarget);
    });
    mocks.useRandomizerTargets.mockReturnValue({ data: [], isLoading: false, error: null });
    rerender();
    await waitFor(() => expect(result.current.selectedTargets).toEqual([]));
    expect(result.current.lastSpinResult).toEqual(diamondTarget);
    expect(result.current.stats.canSpin).toBe(false);
  });

  it('preserves a completed result and section through a same-pool refetch failure', async () => {
    const { result, rerender } = renderHookWithProviders(() => useRandomizer());
    await act(async () => {
      await result.current.handleSpinComplete(diamondTarget);
    });
    const section = { kind: 'number' as const, number: 8, candidates: [2, 8] };
    await act(async () => {
      await result.current.handleSectionChange(section);
    });
    mocks.useRandomizerTargets.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('offline'),
    });
    rerender();
    expect(result.current.stats.canSpin).toBe(false);
    expect(result.current.lastSpinResult).toEqual(diamondTarget);
    expect(result.current.sectionDraft).toEqual(section);
    mocks.useRandomizerTargets.mockReturnValue({
      data: [diamondTarget, { ...diamondTarget, id: 'project23456789', title: 'Beta' }],
      isLoading: false,
      error: null,
    });
    rerender();
    expect(result.current.lastSpinResult).toEqual(diamondTarget);
    expect(result.current.sectionDraft).toEqual(section);
    const replacement = { ...section, number: 2 };
    await act(async () => {
      await result.current.handleSectionChange(replacement);
    });
    expect(updateSpinMetadataMutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        spinId: 'spin12345678901',
        metadata: expect.objectContaining({ section: replacement }),
      })
    );
  });

  it('persists a deferred spin section despite a same-pool refetch failure', async () => {
    const createdSpin = createDeferred<{ id: string; metadata: null }>();
    createSpinMutateAsync.mockReturnValue(createdSpin.promise);
    const { result, rerender } = renderHookWithProviders(() => useRandomizer());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleSpinComplete(diamondTarget);
    });
    const section = { kind: 'number' as const, number: 8, candidates: [2, 8] };
    await act(async () => {
      await result.current.handleSectionChange(section);
    });
    mocks.useRandomizerTargets.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('offline'),
    });
    rerender();
    await act(async () => {
      createdSpin.resolve({ id: 'deferred-spin', metadata: null });
      await pending;
    });
    expect(result.current.sectionDraft).toEqual(section);
    expect(updateSpinMetadataMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        spinId: 'deferred-spin',
        metadata: expect.objectContaining({ section }),
      })
    );
  });

  it('finishes an in-flight scoped page pick despite a same-pool refetch failure', async () => {
    const pages = createDeferred<RandomizerTarget[]>();
    mocks.listColoringPageTargets.mockReturnValue(pages.promise);
    mocks.useRandomizerTargets.mockReturnValue({
      data: [coloringBookTarget],
      isLoading: false,
      error: null,
    });
    window.history.replaceState({}, '', '/randomizer?mode=coloring-book');
    const { result, rerender } = renderHookWithProviders(() => useRandomizer());
    await act(async () => {
      await result.current.handleSpinComplete(coloringBookTarget);
    });
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.pickRandomPageFromBook(coloringBookTarget);
    });
    mocks.useRandomizerTargets.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('offline'),
    });
    rerender();
    expect(result.current.isPickingPageFromBook).toBe(true);
    await act(async () => {
      pages.resolve([coloringPageTarget]);
      await pending;
    });
    expect(result.current.lastSpinResult).toEqual(coloringPageTarget);
    expect(result.current.isPickingPageFromBook).toBe(false);
    expect(createSpinMutateAsync).toHaveBeenCalledTimes(2);
  });

  it('rejects an interrupted wheel completion during failure and after the same pool recovers', async () => {
    const { result, rerender } = renderHookWithProviders(() => useRandomizer());
    const interruptedCompletion = result.current.handleSpinComplete;
    mocks.useRandomizerTargets.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('offline'),
    });
    rerender();
    await act(async () => {
      await interruptedCompletion(diamondTarget);
    });
    expect(createSpinMutateAsync).not.toHaveBeenCalled();
    mocks.useRandomizerTargets.mockReturnValue({
      data: [diamondTarget, { ...diamondTarget, id: 'project23456789', title: 'Beta' }],
      isLoading: false,
      error: null,
    });
    rerender();
    await act(async () => {
      await interruptedCompletion(diamondTarget);
    });
    expect(createSpinMutateAsync).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.handleSpinComplete(diamondTarget);
    });
    expect(createSpinMutateAsync).toHaveBeenCalledTimes(1);
  });

  it.each(['mode', 'eligibility', 'account'] as const)(
    'does not reuse another %s pool after a failed request and recovers on success',
    async change => {
      const { result, rerender } = renderHookWithProviders(() => useRandomizer());
      await waitFor(() => expect(result.current.stats.canSpin).toBe(true));
      mocks.useRandomizerTargets.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('offline'),
      });
      act(() => {
        if (change === 'mode') result.current.setMode('coloring-book');
        if (change === 'eligibility')
          result.current.updateEligibility({ diamondStatuses: ['completed'] });
        if (change === 'account') {
          mocks.useAuth.mockReturnValue({ user: { id: 'other-user' } });
          rerender();
        }
      });
      expect(result.current.availableTargets).toEqual([]);
      expect(result.current.stats.canSpin).toBe(false);
      await act(async () => {
        await result.current.handleSpinComplete(diamondTarget);
      });
      expect(createSpinMutateAsync).not.toHaveBeenCalled();
      const recovered = change === 'mode' ? coloringBookTarget : diamondTarget;
      mocks.useRandomizerTargets.mockReturnValue({
        data: [recovered],
        isLoading: false,
        error: null,
      });
      rerender();
      await waitFor(() => expect(result.current.selectedTargets).toEqual([recovered]));
      expect(result.current.stats.canSpin).toBe(true);
    }
  );

  it('rejects an obsolete completion after clearing and reselecting the same pool', async () => {
    const { result } = renderHookWithProviders(() => useRandomizer());
    await waitFor(() => expect(result.current.stats.canSpin).toBe(true));
    const obsoleteCompletion = result.current.handleSpinComplete;
    act(() => {
      result.current.selectNoTargets();
    });
    act(() => {
      result.current.selectAllTargets();
    });
    await act(async () => {
      await obsoleteCompletion(diamondTarget);
    });
    expect(createSpinMutateAsync).not.toHaveBeenCalled();
    expect(result.current.lastSpinResult).toBeNull();
    await act(async () => {
      await result.current.handleSpinComplete(diamondTarget);
    });
    expect(createSpinMutateAsync).toHaveBeenCalledTimes(1);
  });

  it.each(['before completion', 'after completion'] as const)(
    'uses fresh result measurements when refetched %s',
    async timing => {
      const { result, rerender } = renderHookWithProviders(() => useRandomizer());
      await waitFor(() => expect(result.current.stats.canSpin).toBe(true));
      const completeSpin = result.current.handleSpinComplete;
      if (timing === 'after completion')
        await act(async () => {
          await completeSpin(diamondTarget);
        });
      const refreshed = { ...diamondTarget, width: 60, height: 80, totalDiamonds: 76800 };
      mocks.useRandomizerTargets.mockReturnValue({
        data: [refreshed, { ...diamondTarget, id: 'project23456789', title: 'Beta' }],
        isLoading: false,
        error: null,
      });
      rerender();
      await waitFor(() => expect(result.current.selectedTargets[0]).toEqual(refreshed));
      if (timing === 'before completion')
        await act(async () => {
          await completeSpin(diamondTarget);
        });
      expect(result.current.lastSpinResult).toEqual(refreshed);
    }
  );

  it('uses refreshed measurements without changing the selection', async () => {
    const { result, rerender } = renderHookWithProviders(() => useRandomizer());
    await waitFor(() => expect(result.current.selectedTargets).toHaveLength(2));
    act(() => result.current.toggleTarget('project23456789'));
    const refreshed = { ...diamondTarget, width: 60, height: 80, totalDiamonds: 76800 };
    mocks.useRandomizerTargets.mockReturnValue({
      data: [refreshed, { ...diamondTarget, id: 'project23456789', title: 'Beta' }],
      isLoading: false,
      error: null,
    });
    rerender();
    await waitFor(() => expect(result.current.selectedTargets).toEqual([refreshed]));
  });

  it('preserves coloring mode from URL while vertical settings load', () => {
    mocks.useEnabledVerticals.mockReturnValue({
      diamond_painting: true,
      coloring_books: false,
      isLoading: true,
    });
    window.history.replaceState({}, '', '/randomizer?mode=coloring-book&items=book12345678901');

    const { result } = renderHookWithProviders(() => useRandomizer());

    expect(result.current.mode).toBe('coloring-book');
  });

  it('keeps coloring mode after vertical settings load for opted-in users', () => {
    mocks.useEnabledVerticals.mockReturnValue({
      diamond_painting: true,
      coloring_books: true,
      isLoading: false,
    });
    window.history.replaceState({}, '', '/randomizer?mode=coloring-page');

    const { result } = renderHookWithProviders(() => useRandomizer());

    expect(result.current.mode).toBe('coloring-page');
    expect(mocks.useRandomizerTargets).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'coloring-page' })
    );
  });

  it('keeps select none as an explicit empty selection', async () => {
    const { result } = renderHookWithProviders(() => useRandomizer());

    await waitFor(() => {
      expect(result.current.selectedTargetIds.size).toBe(2);
    });

    act(() => {
      result.current.selectAllTargets();
    });

    expect(result.current.selectedTargetIds.size).toBe(2);

    act(() => {
      result.current.selectNoTargets();
    });

    expect(result.current.selectedTargetIds.size).toBe(0);
    expect(new URLSearchParams(window.location.search).get('items')).toBe('none');

    await waitFor(() => {
      expect(result.current.selectedTargetIds.size).toBe(0);
    });
  });

  it('leaves an already-normalized empty-pool URL alone after an empty-data reference change', async () => {
    const path = '/randomizer?diamondStatus=progress&bookStatus=in_progress&custom=keep';
    window.history.replaceState({}, '', path);
    mocks.useRandomizerTargets.mockReturnValue({ data: [], isLoading: false, error: null });
    const replaceState = vi.spyOn(window.history, 'replaceState');
    try {
      const { result, rerender } = renderHookWithProviders(() => useRandomizer());
      await waitFor(() => expect(result.current.availableTargets).toHaveLength(0));
      expect(replaceState).not.toHaveBeenCalled();

      mocks.useRandomizerTargets.mockReturnValue({ data: [], isLoading: false, error: null });
      rerender();

      await waitFor(() => expect(result.current.availableTargets).toHaveLength(0));
      expect(replaceState).not.toHaveBeenCalled();
      expect(`${window.location.pathname}${window.location.search}`).toBe(path);
      expect(result.current.eligibility.diamondStatuses).toEqual(['progress']);
      expect(result.current.eligibility.bookStatuses).toEqual(['in_progress']);
    } finally {
      replaceState.mockRestore();
    }
  });

  it.each(['items=none', `items=${diamondTarget.id}`, `projects=${diamondTarget.id}`])(
    'clears %s after a successful empty pool so new targets use the default selection',
    async selection => {
      window.history.replaceState({}, '', `/randomizer?${selection}`);
      mocks.useRandomizerTargets.mockReturnValue({ data: [], isLoading: false, error: null });
      const { result, rerender } = renderHookWithProviders(() => useRandomizer());

      await waitFor(() => {
        const params = new URLSearchParams(window.location.search);
        expect(params.has('items')).toBe(false);
        expect(params.has('projects')).toBe(false);
      });
      expect(result.current.selectedTargetIds.size).toBe(0);

      const newTarget = { ...diamondTarget, id: 'project23456789', title: 'New project' };
      mocks.useRandomizerTargets.mockReturnValue({
        data: [diamondTarget, newTarget],
        isLoading: false,
        error: null,
      });
      rerender();

      await waitFor(() => {
        expect([...result.current.selectedTargetIds]).toEqual([diamondTarget.id, newTarget.id]);
      });
      expect(result.current.stats.canSpin).toBe(true);
    }
  );

  it.each(['loading', 'error', 'no account', 'craft settings loading', 'no result'])(
    'preserves URL selection while the empty target pool has %s',
    async pendingState => {
      window.history.replaceState({}, '', `/randomizer?items=${diamondTarget.id}`);
      mocks.useRandomizerTargets.mockReturnValue({
        data: pendingState === 'no result' ? undefined : [],
        isLoading: pendingState === 'loading',
        error: pendingState === 'error' ? new Error('Targets unavailable') : null,
      });
      if (pendingState === 'no account') mocks.useAuth.mockReturnValue({ user: null });
      if (pendingState === 'craft settings loading') {
        mocks.useEnabledVerticals.mockReturnValue({
          diamond_painting: true,
          coloring_books: true,
          isLoading: true,
        });
      }
      const replaceState = vi.spyOn(window.history, 'replaceState');
      try {
        const { result } = renderHookWithProviders(() => useRandomizer());

        await waitFor(() => expect(result.current.availableTargets).toHaveLength(0));
        expect(new URLSearchParams(window.location.search).get('items')).toBe(diamondTarget.id);
        expect(replaceState).not.toHaveBeenCalled();
      } finally {
        replaceState.mockRestore();
      }
    }
  );

  it.each([
    ['diamond', 'diamondStatuses', diamondTarget],
    ['coloring-book', 'bookStatuses', coloringBookTarget],
    ['coloring-page', 'pageStatuses', coloringPageTarget],
  ] as const)(
    'preserves select none across empty filters in %s mode',
    async (mode, statusKey, target) => {
      window.history.replaceState({}, '', `/randomizer?mode=${mode}`);
      mocks.useRandomizerTargets.mockReturnValue({ data: [target], isLoading: false, error: null });
      mocks.useRandomizerHasTargets.mockReturnValue({ data: true, isFetching: false, error: null });
      const { result, rerender } = renderHookWithProviders(() => useRandomizer());
      await waitFor(() => expect(result.current.selectedTargetIds.has(target.id)).toBe(true));
      act(() => result.current.selectNoTargets());
      const originalStatuses = result.current.eligibility[statusKey];
      mocks.useRandomizerTargets.mockReturnValue({ data: [], isLoading: false, error: null });
      act(() => result.current.updateEligibility({ [statusKey]: [] }));
      await waitFor(() => expect(result.current.availableTargets).toHaveLength(0));
      expect(new URLSearchParams(window.location.search).get('items')).toBe('none');
      mocks.useRandomizerTargets.mockReturnValue({ data: [target], isLoading: false, error: null });
      act(() => result.current.updateEligibility({ [statusKey]: originalStatuses }));
      rerender();
      await waitFor(() => expect(result.current.availableTargets).toHaveLength(1));
      expect(result.current.selectedTargetIds.size).toBe(0);
      expect(new URLSearchParams(window.location.search).get('items')).toBe('none');
      expect(result.current.stats.canSpin).toBe(false);
    }
  );

  it.each(['populated', 'fetching', 'error', 'unknown'])(
    'preserves a reopened empty-filter select-none URL while library presence is %s',
    async state => {
      window.history.replaceState({}, '', '/randomizer?items=none&diamondStatus=completed');
      mocks.useRandomizerTargets.mockReturnValue({ data: [], isLoading: false, error: null });
      mocks.useRandomizerHasTargets.mockReturnValue({
        data: state === 'populated' ? true : state === 'unknown' ? undefined : false,
        isFetching: state === 'fetching',
        error: state === 'error' ? new Error('Library unavailable') : null,
      });
      const { result } = renderHookWithProviders(() => useRandomizer());
      await waitFor(() => expect(result.current.availableTargets).toHaveLength(0));
      expect(new URLSearchParams(window.location.search).get('items')).toBe('none');
    }
  );

  it('defaults eligible targets into the pool without URL selection params', async () => {
    const { result } = renderHookWithProviders(() => useRandomizer());

    await waitFor(() => {
      expect(result.current.availableTargets).toHaveLength(2);
    });

    expect(result.current.selectedTargetIds.size).toBe(2);
    expect(result.current.stats.canSpin).toBe(true);
    expect(new URLSearchParams(window.location.search).get('items')).toBeNull();
  });

  it('allows a one-item pool to spin', async () => {
    mocks.useRandomizerTargets.mockReturnValue({
      data: [diamondTarget],
      isLoading: false,
      error: null,
    });

    const { result } = renderHookWithProviders(() => useRandomizer());

    await waitFor(() => {
      expect(result.current.selectedTargetIds.size).toBe(1);
    });

    expect(result.current.stats.canSpin).toBe(true);
  });

  it('hides the previous craft pool while a different craft loads', async () => {
    mocks.useRandomizerTargets.mockImplementation((args: { mode: string }) => {
      if (args.mode === 'coloring-book') {
        return {
          data: undefined,
          isLoading: true,
          error: null,
        };
      }

      return {
        data: [diamondTarget, { ...diamondTarget, id: 'project23456789', title: 'Beta' }],
        isLoading: false,
        error: null,
      };
    });

    const { result } = renderHookWithProviders(() => useRandomizer());

    await waitFor(() => {
      expect(result.current.selectedTargetIds.size).toBe(2);
    });

    act(() => {
      result.current.setMode('coloring-book');
    });

    expect(result.current.mode).toBe('coloring-book');
    expect(result.current.isLoadingTargets).toBe(true);
    expect(result.current.availableTargets).toHaveLength(0);
    expect(result.current.selectedTargets).toHaveLength(0);
    expect(result.current.stats.canSpin).toBe(false);
  });

  it('does not reinitialize selection when the same target pool returns in a different order', async () => {
    const betaTarget = { ...diamondTarget, id: 'project23456789', title: 'Beta' };
    let queryTargets = [diamondTarget, betaTarget];
    mocks.useRandomizerTargets.mockImplementation(() => ({
      data: queryTargets,
      isLoading: false,
      error: null,
    }));

    const { result, rerender } = renderHookWithProviders(() => useRandomizer());

    await waitFor(() => {
      expect(result.current.selectedTargetIds.size).toBe(2);
    });

    act(() => {
      result.current.toggleTarget(betaTarget.id);
    });
    expect(result.current.selectedTargetIds.has(betaTarget.id)).toBe(false);

    queryTargets = [betaTarget, diamondTarget];
    rerender();

    await waitFor(() => {
      expect(result.current.selectedTargetIds.has(betaTarget.id)).toBe(false);
    });
    expect(result.current.selectedTargetIds.has(diamondTarget.id)).toBe(true);
    expect(result.current.availableTargets.map(target => target.id)).toEqual([
      diamondTarget.id,
      betaTarget.id,
    ]);
  });

  it('hydrates valid target selections from URL params', async () => {
    window.history.replaceState({}, '', '/randomizer?items=project12345678');

    const { result } = renderHookWithProviders(() => useRandomizer());

    await waitFor(() => {
      expect(result.current.selectedTargetIds.size).toBe(1);
    });

    expect(result.current.selectedTargetIds.has('project12345678')).toBe(true);
  });

  it('hydrates legacy diamond project selections from URL params', async () => {
    window.history.replaceState({}, '', '/randomizer?projects=project12345678');

    const { result } = renderHookWithProviders(() => useRandomizer());

    await waitFor(() => {
      expect(result.current.selectedTargetIds.size).toBe(1);
    });

    expect(result.current.selectedTargetIds.has('project12345678')).toBe(true);
    expect(new URLSearchParams(window.location.search).get('projects')).toBeNull();
  });

  it('forces diamond mode after settings load for users without coloring enabled', async () => {
    mocks.useEnabledVerticals.mockReturnValue({
      diamond_painting: true,
      coloring_books: false,
      isLoading: false,
    });
    window.history.replaceState({}, '', '/randomizer?mode=coloring-page');

    const { result } = renderHookWithProviders(() => useRandomizer());

    await waitFor(() => {
      expect(result.current.mode).toBe('diamond');
    });
  });

  it('forces coloring mode after settings load for users without diamond painting enabled', async () => {
    mocks.useEnabledVerticals.mockReturnValue({
      diamond_painting: false,
      coloring_books: true,
      isLoading: false,
    });

    const { result } = renderHookWithProviders(() => useRandomizer());

    await waitFor(() => {
      expect(result.current.mode).toBe('coloring-book');
    });
    expect(result.current.canUseDiamond).toBe(false);
    expect(mocks.useRandomizerTargets).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'coloring-book' })
    );
  });

  it('persists generated diamond section metadata to the saved spin', async () => {
    const { result } = renderHookWithProviders(() => useRandomizer());

    await act(async () => {
      await result.current.handleSpinComplete(diamondTarget);
    });

    await act(async () => {
      await result.current.handleSectionChange({
        widthCm: 10,
        heightCm: 10,
        estimatedDiamonds: 4000,
      });
    });

    expect(updateSpinMetadataMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user12345678901',
        spinId: 'spin12345678901',
        metadata: expect.objectContaining({
          section: expect.objectContaining({ widthCm: 10, heightCm: 10 }),
        }),
      })
    );
    expect(addProgressNoteMutateAsync).not.toHaveBeenCalled();
  });

  it('builds and saves diamond progress notes without a section size', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T02:30:00.000Z'));
    const { result } = renderHookWithProviders(() => useRandomizer());

    await act(async () => {
      await result.current.handleSpinComplete(diamondTarget);
    });

    expect(result.current.getDefaultDiamondProgressNote()).toBe(
      'The randomizer picked this diamond art project: Aurora Wolves'
    );
    expect(result.current.getDefaultDiamondProgressNote()).not.toContain('Source: Randomizer');

    await act(async () => {
      await result.current.saveDiamondProgressNote(result.current.getDefaultDiamondProgressNote());
    });

    expect(addProgressNoteMutateAsync).toHaveBeenCalledWith({
      projectId: diamondTarget.id,
      noteData: {
        date: '2026-05-07',
        content: 'The randomizer picked this diamond art project: Aurora Wolves',
      },
    });
  });

  it('includes randomized section size and approximate estimate in diamond progress notes', async () => {
    const { result } = renderHookWithProviders(() => useRandomizer());

    await act(async () => {
      await result.current.handleSpinComplete(diamondTarget);
    });

    await act(async () => {
      await result.current.handleSectionChange({
        widthCm: 10,
        heightCm: 10,
        estimatedDiamonds: 4000,
      });
    });

    expect(result.current.getDefaultDiamondProgressNote()).toBe(
      [
        'The randomizer picked this diamond art project: Aurora Wolves',
        '',
        'Section size: 10 x 10 cm',
        'Estimated diamonds (approx.): 4,000',
      ].join('\n')
    );
    expect(result.current.getDefaultDiamondProgressNote()).not.toContain('Start:');
    expect(result.current.getDefaultDiamondProgressNote()).not.toContain('Source: Randomizer');
  });

  it('creates a coloring page progress note only when explicitly saved', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T02:30:00.000Z'));
    const coloringTarget: RandomizerTarget = {
      id: 'page1234567890',
      mode: 'coloring-page',
      targetType: 'coloring_page',
      title: 'Garden Pages, page 7',
      subtitle: 'Garden Pages',
      href: '/coloring/book1234567890/pages/page1234567890',
      statusLabel: 'In progress',
      selectedMetadata: {
        coloringPage: 'page1234567890',
      },
    };
    window.history.replaceState({}, '', '/randomizer?mode=coloring-page');
    const { result } = renderHookWithProviders(() => useRandomizer());

    await act(async () => {
      await result.current.handleSpinComplete(coloringTarget);
    });

    expect(addColoringPageProgressNoteMutateAsync).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.saveRandomizerNote('New note');
    });

    expect(addColoringPageProgressNoteMutateAsync).toHaveBeenCalledWith({
      pageId: 'page1234567890',
      noteData: {
        date: '2026-05-07',
        content: 'New note',
      },
    });
  });

  it('picks an unfinished random page from the selected coloring book result', async () => {
    mocks.listColoringPageTargets.mockResolvedValue([coloringPageTarget]);
    window.history.replaceState({}, '', '/randomizer?mode=coloring-book');
    const { result } = renderHookWithProviders(() => useRandomizer());

    await act(async () => {
      await result.current.handleSpinComplete(coloringBookTarget);
    });

    await act(async () => {
      await result.current.pickRandomPageFromBook(coloringBookTarget);
    });

    expect(mocks.listColoringPageTargets).toHaveBeenCalledWith(
      'user12345678901',
      expect.objectContaining({
        pageStatuses: ['not_started', 'palette_chosen', 'in_progress', 'on_hold'],
      }),
      { bookId: 'book1234567890' }
    );
    expect(result.current.lastSpinResult).toMatchObject({
      id: 'page1234567890',
      targetType: 'coloring_page',
    });
    expect(result.current.mode).toBe('coloring-book');
    expect(createSpinMutateAsync).toHaveBeenLastCalledWith({
      user: 'user12345678901',
      project_title: 'Garden Pages, page 7',
      selected_projects: ['page1234567890'],
      metadata: expect.objectContaining({
        mode: 'coloring-page',
        target: expect.objectContaining({
          id: 'page1234567890',
          targetType: 'coloring_page',
        }),
        selectedTargetIds: ['page1234567890'],
      }),
    });
  });

  it('does not restore or record a pending page pick after the result is cleared', async () => {
    const pages = createDeferred<RandomizerTarget[]>();
    mocks.listColoringPageTargets.mockReturnValue(pages.promise);
    const { result } = renderHookWithProviders(() => useRandomizer());

    await act(async () => {
      await result.current.handleSpinComplete(coloringBookTarget);
    });

    let pagePickPromise!: Promise<void>;
    act(() => {
      pagePickPromise = result.current.pickRandomPageFromBook(coloringBookTarget);
    });
    act(() => {
      result.current.clearLastResult();
    });

    await act(async () => {
      pages.resolve([coloringPageTarget]);
      await pagePickPromise;
    });

    expect(result.current.lastSpinResult).toBeNull();
    expect(result.current.isPickingPageFromBook).toBe(false);
    expect(createSpinMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('does not restore or record a pending page pick after the mode changes', async () => {
    const pages = createDeferred<RandomizerTarget[]>();
    mocks.listColoringPageTargets.mockReturnValue(pages.promise);
    const { result } = renderHookWithProviders(() => useRandomizer());

    await act(async () => {
      await result.current.handleSpinComplete(coloringBookTarget);
    });

    let pagePickPromise!: Promise<void>;
    act(() => {
      pagePickPromise = result.current.pickRandomPageFromBook(coloringBookTarget);
    });
    act(() => {
      result.current.setMode('diamond');
    });

    await act(async () => {
      pages.resolve([coloringPageTarget]);
      await pagePickPromise;
    });

    expect(result.current.mode).toBe('diamond');
    expect(result.current.lastSpinResult).toBeNull();
    expect(createSpinMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('clears a pending page pick when enabled crafts force a mode change', async () => {
    window.history.replaceState({}, '', '/randomizer?mode=coloring-book');
    const pages = createDeferred<RandomizerTarget[]>();
    mocks.listColoringPageTargets.mockReturnValue(pages.promise);
    const { result, rerender } = renderHookWithProviders(() => useRandomizer());

    await act(async () => {
      await result.current.handleSpinComplete(coloringBookTarget);
    });
    let pagePickPromise!: Promise<void>;
    act(() => {
      pagePickPromise = result.current.pickRandomPageFromBook(coloringBookTarget);
    });
    mocks.useEnabledVerticals.mockReturnValue({
      diamond_painting: true,
      coloring_books: false,
      isLoading: false,
    });
    rerender();

    expect(result.current.mode).toBe('diamond');
    expect(result.current.lastSpinResult).toBeNull();
    expect(result.current.sectionDraft).toBeNull();
    expect(result.current.isPickingPageFromBook).toBe(false);
    expect(result.current.pagePickError).toBeNull();

    await act(async () => {
      pages.resolve([coloringPageTarget]);
      await pagePickPromise;
    });
    expect(result.current.lastSpinResult).toBeNull();
    expect(createSpinMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('does not replace a newer result with a pending page pick', async () => {
    const pages = createDeferred<RandomizerTarget[]>();
    mocks.listColoringPageTargets.mockReturnValue(pages.promise);
    const { result } = renderHookWithProviders(() => useRandomizer());

    await act(async () => {
      await result.current.handleSpinComplete(coloringBookTarget);
    });

    let pagePickPromise!: Promise<void>;
    act(() => {
      pagePickPromise = result.current.pickRandomPageFromBook(coloringBookTarget);
    });
    await act(async () => {
      await result.current.handleSpinComplete(diamondTarget);
    });

    await act(async () => {
      pages.resolve([coloringPageTarget]);
      await pagePickPromise;
    });

    expect(result.current.lastSpinResult).toMatchObject({
      id: diamondTarget.id,
      targetType: 'diamond_project',
    });
    expect(createSpinMutateAsync).toHaveBeenCalledTimes(2);
  });

  it('keeps the latest page pick when an earlier request resolves later', async () => {
    const earlierPages = createDeferred<RandomizerTarget[]>();
    const latestPageTarget: RandomizerTarget = {
      ...coloringPageTarget,
      id: 'page2345678901',
      title: 'Garden Pages, page 8',
      href: '/coloring/book1234567890/pages/page2345678901',
      selectedMetadata: {
        coloringPage: 'page2345678901',
        coloringBook: 'book1234567890',
      },
    };
    mocks.listColoringPageTargets
      .mockReturnValueOnce(earlierPages.promise)
      .mockResolvedValueOnce([latestPageTarget]);
    const { result } = renderHookWithProviders(() => useRandomizer());

    await act(async () => {
      await result.current.handleSpinComplete(coloringBookTarget);
    });

    let earlierPickPromise!: Promise<void>;
    act(() => {
      earlierPickPromise = result.current.pickRandomPageFromBook(coloringBookTarget);
    });
    await act(async () => {
      await result.current.pickRandomPageFromBook(coloringBookTarget);
    });

    await act(async () => {
      earlierPages.resolve([coloringPageTarget]);
      await earlierPickPromise;
    });

    expect(result.current.lastSpinResult).toMatchObject({
      id: latestPageTarget.id,
      targetType: 'coloring_page',
    });
    expect(result.current.isPickingPageFromBook).toBe(false);
    expect(createSpinMutateAsync).toHaveBeenCalledTimes(2);
  });

  it('persists section numbers and includes them in progress notes', async () => {
    createSpinMutateAsync.mockResolvedValue({ id: 'spin12345678901', metadata: null });
    const { result } = renderHookWithProviders(() => useRandomizer());
    await act(async () => {
      await result.current.handleSpinComplete(diamondTarget);
    });
    const section = { kind: 'number' as const, number: 8, candidates: [2, 8, 19] };
    await act(async () => {
      await result.current.handleSectionChange(section);
    });
    expect(updateSpinMetadataMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ section }) })
    );
    expect(result.current.getDefaultDiamondProgressNote()).toContain('Section number: 8');
    expect(result.current.getDefaultDiamondProgressNote()).not.toContain('Section size:');
  });

  it('persists a section selected while spin history is being created', async () => {
    const createdSpin = createDeferred<{ id: string; metadata: null }>();
    createSpinMutateAsync.mockReturnValue(createdSpin.promise);
    const { result } = renderHookWithProviders(() => useRandomizer());

    let spinPromise!: Promise<void>;
    act(() => {
      spinPromise = result.current.handleSpinComplete(diamondTarget);
    });

    await act(async () => {
      await result.current.handleSectionChange({
        widthCm: 10,
        heightCm: 10,
        estimatedDiamonds: 4000,
      });
    });

    await act(async () => {
      createdSpin.resolve({ id: 'spin12345678901', metadata: null });
      await spinPromise;
    });

    expect(updateSpinMetadataMutateAsync).toHaveBeenCalledWith({
      userId: 'user12345678901',
      spinId: 'spin12345678901',
      metadata: expect.objectContaining({
        version: 1,
        target: expect.objectContaining({ id: diamondTarget.id }),
        section: {
          widthCm: 10,
          heightCm: 10,
          estimatedDiamonds: 4000,
        },
      }),
    });
  });

  it('ignores a delayed section retry after the same target is spun again', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const secondCreatedSpin = createDeferred<{ id: string; metadata: null }>();
    createSpinMutateAsync
      .mockResolvedValueOnce({ id: 'spin-a', metadata: null })
      .mockReturnValueOnce(secondCreatedSpin.promise);
    const targetWithDimensions = {
      ...diamondTarget,
      width: 40,
      height: 50,
      totalDiamonds: 80000,
    };

    mocks.useRandomizerTargets.mockReturnValue({
      data: [targetWithDimensions],
      isLoading: false,
      error: null,
    });

    function RandomizerSectionRaceHarness() {
      const randomizer = useRandomizer();

      return (
        <>
          <button
            type="button"
            onClick={() => void randomizer.handleSpinComplete(targetWithDimensions)}
          >
            Spin target
          </button>
          <RandomizerResultPanel
            target={randomizer.lastSpinResult}
            section={randomizer.sectionDraft}
            onSectionChange={randomizer.handleSectionChange}
            progressNote={{
              onSave: randomizer.saveDiamondProgressNote,
              getDefault: randomizer.getDefaultDiamondProgressNote,
            }}
            onClear={randomizer.clearLastResult}
          />
        </>
      );
    }

    renderWithProviders(<RandomizerSectionRaceHarness />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Spin target' }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /pick a section/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^pick size$/i }));
      await Promise.resolve();
    });
    expect(screen.getByText('Size randomly picked:')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Spin target' }));
    });
    expect(createSpinMutateAsync).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Size randomly picked:')).not.toBeInTheDocument();
    updateSpinMetadataMutateAsync.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(screen.queryByText('Size randomly picked:')).not.toBeInTheDocument();
    expect(updateSpinMetadataMutateAsync).not.toHaveBeenCalled();

    await act(async () => {
      secondCreatedSpin.resolve({ id: 'spin-b', metadata: null });
      await Promise.resolve();
    });

    expect(screen.queryByText('Size randomly picked:')).not.toBeInTheDocument();
    expect(updateSpinMetadataMutateAsync).not.toHaveBeenCalled();
  });

  it('persists the latest section when the deferred draft update resolves last', async () => {
    const createdSpin = createDeferred<{ id: string; metadata: null }>();
    const earlierUpdate = createDeferred<void>();
    const newerUpdate = createDeferred<void>();
    let persistedSection: { widthCm: number; heightCm: number } | undefined;
    createSpinMutateAsync.mockReturnValue(createdSpin.promise);
    updateSpinMetadataMutateAsync
      .mockImplementationOnce(async ({ metadata }) => {
        await earlierUpdate.promise;
        persistedSection = metadata.section;
      })
      .mockImplementationOnce(async ({ metadata }) => {
        await newerUpdate.promise;
        persistedSection = metadata.section;
      });
    const { result } = renderHookWithProviders(() => useRandomizer());

    let spinPromise!: Promise<void>;
    act(() => {
      spinPromise = result.current.handleSpinComplete(diamondTarget);
    });
    await act(async () => {
      await result.current.handleSectionChange({ widthCm: 10, heightCm: 10 });
    });

    act(() => {
      createdSpin.resolve({ id: 'spin12345678901', metadata: null });
    });
    await waitFor(() => expect(updateSpinMetadataMutateAsync).toHaveBeenCalledTimes(1));

    let newerSectionPromise!: Promise<void>;
    act(() => {
      newerSectionPromise = result.current.handleSectionChange({ widthCm: 5, heightCm: 5 });
    });
    await waitFor(() => expect(result.current.sectionDraft).toEqual({ widthCm: 5, heightCm: 5 }));

    await act(async () => {
      newerUpdate.resolve(undefined);
      await Promise.resolve();
    });
    await act(async () => {
      earlierUpdate.resolve(undefined);
      await Promise.all([spinPromise, newerSectionPromise]);
    });

    expect(updateSpinMetadataMutateAsync).toHaveBeenCalledTimes(2);
    expect(updateSpinMetadataMutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        spinId: 'spin12345678901',
        metadata: expect.objectContaining({
          section: { widthCm: 5, heightCm: 5 },
        }),
      })
    );
    expect(persistedSection).toEqual({ widthCm: 5, heightCm: 5 });
  });

  it('shows an inline empty state when a coloring book has no unfinished pages', async () => {
    mocks.listColoringPageTargets.mockResolvedValue([]);
    const { result } = renderHookWithProviders(() => useRandomizer());

    await act(async () => {
      await result.current.handleSpinComplete(coloringBookTarget);
    });

    await act(async () => {
      await result.current.pickRandomPageFromBook(coloringBookTarget);
    });

    expect(result.current.lastSpinResult).toMatchObject({
      id: 'book1234567890',
      targetType: 'coloring_book',
    });
    expect(result.current.pagePickError).toBe('No unfinished pages match this book yet.');
    expect(createSpinMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('preserves a failed page pick reason without exposing it as the message', async () => {
    mocks.listColoringPageTargets.mockRejectedValue({
      type: 'validation',
      message: 'Please check your input and try again.',
      retryable: false,
      cause: {
        status: 400,
        data: {
          data: {
            reason: {
              code: 'verification_busy',
              message: 'Internal verification detail',
            },
          },
        },
      },
    });
    const { result } = renderHookWithProviders(() => useRandomizer());

    await act(async () => {
      await result.current.pickRandomPageFromBook(coloringBookTarget);
    });

    expect(result.current.pagePickErrorReason).toBe('verification_busy');
    expect(result.current.pagePickError).toBe(
      'Could not pick a page from this book. Please try again.'
    );
  });

  it('saves and clears a per-mode next-up target', async () => {
    const { result } = renderHookWithProviders(() => useRandomizer());

    await act(async () => {
      await result.current.toggleNextUpTarget(diamondTarget);
    });

    expect(saveRandomizerNextUpMutateAsync).toHaveBeenCalledWith({
      userId: 'user12345678901',
      preferences: {
        version: 1,
        targets: {
          diamond: expect.objectContaining({
            id: 'project12345678',
            mode: 'diamond',
            targetType: 'diamond_project',
            title: 'Aurora Wolves',
          }),
        },
      },
    });

    mocks.useRandomizerNextUp.mockReturnValue({
      data: {
        version: 1,
        targets: {
          diamond: {
            id: 'project12345678',
            mode: 'diamond',
            targetType: 'diamond_project',
            title: 'Aurora Wolves',
            subtitle: 'Moonlight Co.',
            href: '/projects/project12345678',
            savedAt: '2026-05-10T12:00:00.000Z',
          },
        },
      },
    });

    const { result: hydratedResult } = renderHookWithProviders(() => useRandomizer());

    await act(async () => {
      await hydratedResult.current.clearNextUpTarget('diamond');
    });

    expect(saveRandomizerNextUpMutateAsync).toHaveBeenLastCalledWith({
      userId: 'user12345678901',
      preferences: {
        version: 1,
        targets: {},
      },
    });
  });

  it('skips saving when clearing an empty next-up mode', async () => {
    const { result } = renderHookWithProviders(() => useRandomizer());

    await act(async () => {
      await result.current.clearNextUpTarget('diamond');
    });

    expect(saveRandomizerNextUpMutateAsync).not.toHaveBeenCalled();
  });
});
