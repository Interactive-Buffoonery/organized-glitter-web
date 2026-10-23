import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHookWithProviders, waitFor } from '@/test-utils';
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
});
