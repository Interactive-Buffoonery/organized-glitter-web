import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type SetStateAction,
} from 'react';
import {
  useRandomizerHasTargets,
  useRandomizerTargets,
} from '@/hooks/queries/useRandomizerTargets';
import { createLogger } from '@/utils/logger';
import { getStructuredErrorReason } from '@/utils/error/structuredErrorReason';
import type {
  RandomizerEligibility,
  RandomizerMode,
  RandomizerSection,
  RandomizerSpinMetadata,
  RandomizerTarget,
} from '@/types/randomizer';
import { DEFAULT_RANDOMIZER_ELIGIBILITY } from '@/types/randomizer';
import {
  buildRandomizerUrl,
  buildSpinMetadata,
  parseRandomizerSearch,
  reconcileTargetPool,
  resolveTargetSelection,
} from './randomizerSession';

const logger = createLogger('useRandomizerSession');
const EMPTY_TARGETS: RandomizerTarget[] = [];
const UNFINISHED_COLORING_PAGE_STATUSES = [
  'not_started',
  'palette_chosen',
  'in_progress',
  'on_hold',
];

type CreateSpin = (params: {
  user: string;
  project?: string;
  project_title: string;
  project_company?: string;
  project_artist?: string;
  selected_projects: string[];
  metadata?: RandomizerSpinMetadata;
}) => Promise<{ id: string; metadata?: RandomizerSpinMetadata | null }>;

type UpdateSpinMetadata = (params: {
  userId: string;
  spinId: string;
  metadata: RandomizerSpinMetadata;
}) => Promise<unknown>;

type ListColoringPageTargets = (
  userId: string,
  eligibility: RandomizerEligibility,
  options: { bookId: string }
) => Promise<RandomizerTarget[]>;

interface UseRandomizerSessionParams {
  userId: string | undefined;
  canUseDiamond: boolean;
  canUseColoring: boolean;
  isLoadingVerticals: boolean;
  createSpin: CreateSpin;
  updateSpinMetadata: UpdateSpinMetadata;
  listColoringPageTargets: ListColoringPageTargets;
}

type RandomizerResultState = {
  lastSpinResult: RandomizerTarget | null;
  activeResultGeneration: number | null;
  sectionDraft: RandomizerSection | null;
  lastSpinRecordId: string | null;
  lastSpinMetadata: RandomizerSpinMetadata | null;
  isPickingPageFromBook: boolean;
  pagePickError: string | null;
  pagePickErrorReason: string | null;
};

const EMPTY_RESULT: RandomizerResultState = {
  lastSpinResult: null,
  activeResultGeneration: null,
  sectionDraft: null,
  lastSpinRecordId: null,
  lastSpinMetadata: null,
  isPickingPageFromBook: false,
  pagePickError: null,
  pagePickErrorReason: null,
};

type ResultUpdate =
  | Partial<RandomizerResultState>
  | ((state: RandomizerResultState) => Partial<RandomizerResultState>);

const updateResultState = (state: RandomizerResultState, update: ResultUpdate) => ({
  ...state,
  ...(typeof update === 'function' ? update(state) : update),
});

export const useRandomizerSession = ({
  userId,
  canUseDiamond,
  canUseColoring,
  isLoadingVerticals,
  createSpin,
  updateSpinMetadata,
  listColoringPageTargets,
}: UseRandomizerSessionParams) => {
  const [mode, setModeState] = useState<RandomizerMode>(
    () => parseRandomizerSearch(typeof window === 'undefined' ? '' : window.location.search).mode
  );
  const [eligibility, setEligibility] = useState<RandomizerEligibility>(
    () =>
      parseRandomizerSearch(typeof window === 'undefined' ? '' : window.location.search).eligibility
  );
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set());
  const [resultState, updateResult] = useReducer(updateResultState, EMPTY_RESULT);
  const {
    lastSpinResult: storedSpinResult,
    activeResultGeneration,
    sectionDraft,
    lastSpinRecordId,
    lastSpinMetadata,
    isPickingPageFromBook,
    pagePickError,
    pagePickErrorReason,
  } = resultState;
  const [settledPool, setSettledPool] = useState<{ key: string; targets: RandomizerTarget[] }>({
    key: '',
    targets: [],
  });
  const [spinRevision, setSpinRevision] = useState(0);
  const initializedSelectionKey = useRef<string | null>(null);
  const resultOperationGeneration = useRef(0);
  const sectionDraftRef = useRef<RandomizerSection | null>(null);
  const [sectionPersistenceQueues] = useState(() => new Map<string, Promise<void>>());

  const normalizedMode = (() => {
    if (isLoadingVerticals) return mode;
    if (!canUseDiamond && canUseColoring && mode === 'diamond') return 'coloring-book';
    if (!canUseColoring && mode !== 'diamond') return 'diamond';
    return mode;
  })();

  const targetsQuery = useRandomizerTargets({
    userId: userId,
    mode: normalizedMode,
    eligibility,
    enabled: !isLoadingVerticals && Boolean(userId),
  });

  const poolKey = JSON.stringify([userId, normalizedMode, eligibility]);
  const settledTargets = settledPool.key === poolKey ? settledPool.targets : [];

  useEffect(() => {
    const nextTargets = targetsQuery.data;
    if (nextTargets) {
      setSettledPool(current => {
        if (current.key !== poolKey) return { key: poolKey, targets: nextTargets };
        const targets = reconcileTargetPool(current.targets, nextTargets);
        return targets === current.targets ? current : { key: poolKey, targets };
      });
    } else if (!targetsQuery.isLoading && !targetsQuery.error) {
      setSettledPool(current =>
        current.key === poolKey && current.targets.length === 0
          ? current
          : { key: poolKey, targets: [] }
      );
    }
  }, [poolKey, targetsQuery.data, targetsQuery.error, targetsQuery.isLoading]);

  const availableTargets =
    settledTargets.length > 0 ? settledTargets : (targetsQuery.data ?? EMPTY_TARGETS);
  const hasExplicitEmptySelection =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('items') === 'none';
  const libraryPresence = useRandomizerHasTargets({
    userId,
    mode: normalizedMode,
    enabled:
      hasExplicitEmptySelection &&
      availableTargets.length === 0 &&
      !targetsQuery.isLoading &&
      !targetsQuery.error &&
      Boolean(targetsQuery.data) &&
      !isLoadingVerticals,
  });
  const lastSpinResult = storedSpinResult
    ? (availableTargets.find(
        target =>
          target.id === storedSpinResult.id && target.targetType === storedSpinResult.targetType
      ) ?? storedSpinResult)
    : null;
  const latestTargets = useRef(availableTargets);
  useEffect(() => {
    latestTargets.current = availableTargets;
  }, [availableTargets]);
  const resultSessionKey = JSON.stringify([poolKey, spinRevision]);
  const spinSessionKey = JSON.stringify([
    resultSessionKey,
    [...selectedTargetIds].sort(),
    Boolean(targetsQuery.error),
    targetsQuery.isLoading,
    isLoadingVerticals,
  ]);
  const spinSession = useMemo(() => ({ key: spinSessionKey }), [spinSessionKey]);
  const activeSpinSession = useRef(spinSession);
  useEffect(() => {
    activeSpinSession.current = spinSession;
  }, [spinSession]);
  useEffect(() => {
    resultOperationGeneration.current += 1;
    sectionDraftRef.current = null;
    updateResult(EMPTY_RESULT);
  }, [resultSessionKey]);
  const selectedTargets = useMemo(
    () => availableTargets.filter(target => selectedTargetIds.has(target.id)),
    [availableTargets, selectedTargetIds]
  );

  const updateUrlParams = useCallback(
    (
      nextMode: RandomizerMode,
      nextEligibility: RandomizerEligibility,
      ids: Set<string>,
      options: { persistEmptySelection?: boolean; omitSelection?: boolean } = {}
    ) => {
      if (typeof window === 'undefined') return;
      const nextUrl = buildRandomizerUrl(window.location.href, {
        mode: nextMode,
        eligibility: nextEligibility,
        selectedTargetIds: ids,
        selection: options.omitSelection
          ? 'default'
          : options.persistEmptySelection
            ? 'none'
            : 'explicit',
      });
      window.history.replaceState({}, '', nextUrl);
    },
    []
  );

  useEffect(() => {
    if (isLoadingVerticals) return;
    if (mode !== normalizedMode) {
      resultOperationGeneration.current += 1;
      sectionDraftRef.current = null;
      updateResult(EMPTY_RESULT);
      setModeState(normalizedMode);
    }
  }, [isLoadingVerticals, mode, normalizedMode]);

  useEffect(() => {
    if (targetsQuery.isLoading) return;

    if (availableTargets.length === 0) {
      setSelectedTargetIds(new Set());
      initializedSelectionKey.current = null;
      if (userId && !isLoadingVerticals && !targetsQuery.error && targetsQuery.data) {
        const params = new URLSearchParams(window.location.search);
        const canClearSelection =
          params.get('items') !== 'none' ||
          (libraryPresence.data === false && !libraryPresence.isFetching && !libraryPresence.error);
        if (canClearSelection && (params.has('items') || params.has('projects'))) {
          updateUrlParams(normalizedMode, eligibility, new Set(), { omitSelection: true });
        }
      }
      return;
    }

    const availableSignature = availableTargets.map(target => target.id).join(',');
    const selectionKey = `${poolKey}:${availableSignature}`;
    if (initializedSelectionKey.current === selectionKey) return;
    initializedSelectionKey.current = selectionKey;

    const { ids: nextIds, omitSelection } = resolveTargetSelection(
      window.location.search,
      normalizedMode,
      availableTargets
    );
    setSelectedTargetIds(nextIds);
    updateUrlParams(normalizedMode, eligibility, nextIds, {
      omitSelection,
      persistEmptySelection: hasExplicitEmptySelection,
    });
  }, [
    availableTargets,
    eligibility,
    normalizedMode,
    poolKey,
    targetsQuery.isLoading,
    targetsQuery.error,
    targetsQuery.data,
    hasExplicitEmptySelection,
    libraryPresence.data,
    libraryPresence.isFetching,
    libraryPresence.error,
    isLoadingVerticals,
    userId,
    updateUrlParams,
  ]);

  const setMode = useCallback(
    (nextMode: RandomizerMode) => {
      const safeMode = (() => {
        if (!canUseDiamond && canUseColoring && nextMode === 'diamond') return 'coloring-book';
        if (!canUseColoring && nextMode !== 'diamond') return 'diamond';
        return nextMode;
      })();
      resultOperationGeneration.current += 1;
      sectionDraftRef.current = null;
      updateResult(EMPTY_RESULT);
      setModeState(safeMode);
      initializedSelectionKey.current = null;
      const emptySelection = new Set<string>();
      updateUrlParams(safeMode, eligibility, emptySelection);
    },
    [canUseColoring, canUseDiamond, eligibility, updateUrlParams]
  );

  const updateEligibility = useCallback(
    (patch: Partial<RandomizerEligibility>) => {
      const nextEligibility = { ...eligibility, ...patch };
      resultOperationGeneration.current += 1;
      sectionDraftRef.current = null;
      updateResult(EMPTY_RESULT);
      setEligibility(nextEligibility);
      initializedSelectionKey.current = null;
      const emptySelection = new Set<string>();
      updateUrlParams(normalizedMode, nextEligibility, emptySelection, {
        persistEmptySelection: new URLSearchParams(window.location.search).get('items') === 'none',
      });
    },
    [eligibility, normalizedMode, updateUrlParams]
  );

  const resetEligibility = useCallback(() => {
    updateEligibility(DEFAULT_RANDOMIZER_ELIGIBILITY);
  }, [updateEligibility]);

  const toggleTarget = useCallback(
    (targetId: string) => {
      setSpinRevision(value => value + 1);
      setSelectedTargetIds(prev => {
        const next = new Set(prev);
        if (next.has(targetId)) {
          next.delete(targetId);
        } else {
          next.add(targetId);
        }
        updateUrlParams(normalizedMode, eligibility, next);
        return next;
      });
    },
    [eligibility, normalizedMode, updateUrlParams]
  );

  const selectAllTargets = useCallback(() => {
    setSpinRevision(value => value + 1);
    const next = new Set(availableTargets.map(target => target.id));
    setSelectedTargetIds(next);
    updateUrlParams(normalizedMode, eligibility, next, { omitSelection: true });
  }, [availableTargets, eligibility, normalizedMode, updateUrlParams]);

  const selectNoTargets = useCallback(() => {
    setSpinRevision(value => value + 1);
    const next = new Set<string>();
    setSelectedTargetIds(next);
    updateUrlParams(normalizedMode, eligibility, next, { persistEmptySelection: true });
  }, [eligibility, normalizedMode, updateUrlParams]);

  const buildMetadata = useCallback(
    (
      target: RandomizerTarget,
      section?: RandomizerSection,
      options: {
        mode?: RandomizerMode;
        eligibility?: RandomizerEligibility;
        selectedTargetIds?: string[];
        selectedTargets?: RandomizerTarget[];
      } = {}
    ) =>
      buildSpinMetadata({
        target,
        section,
        mode: options.mode ?? normalizedMode,
        eligibility: options.eligibility ?? eligibility,
        selectedTargetIds: options.selectedTargetIds ?? [...selectedTargetIds],
        selectedTargets: options.selectedTargets ?? selectedTargets,
      }),
    [eligibility, normalizedMode, selectedTargetIds, selectedTargets]
  );

  const persistSectionMetadata = useCallback(
    ({
      userId,
      spinId,
      metadata,
    }: {
      userId: string;
      spinId: string;
      metadata: RandomizerSpinMetadata;
    }) => {
      const previousUpdate = sectionPersistenceQueues.get(spinId) ?? Promise.resolve();
      const currentUpdate = previousUpdate
        .catch(() => undefined)
        .then(async () => {
          await updateSpinMetadata({ userId, spinId, metadata });
        });
      const settledUpdate = currentUpdate.then(
        () => undefined,
        () => undefined
      );

      sectionPersistenceQueues.set(spinId, settledUpdate);
      void settledUpdate.then(() => {
        if (sectionPersistenceQueues.get(spinId) === settledUpdate) {
          sectionPersistenceQueues.delete(spinId);
        }
      });

      return currentUpdate;
    },
    [sectionPersistenceQueues, updateSpinMetadata]
  );

  const handleSpinComplete = useCallback(
    async (completedTarget: RandomizerTarget) => {
      const selectedTarget =
        latestTargets.current.find(
          target =>
            target.id === completedTarget.id && target.targetType === completedTarget.targetType
        ) ?? completedTarget;
      if (
        activeSpinSession.current !== spinSession ||
        targetsQuery.error ||
        targetsQuery.isLoading ||
        isLoadingVerticals ||
        selectedTargetIds.size === 0
      )
        return;
      if (!userId) {
        logger.error('No user ID available for spin recording');
        return;
      }

      const operationGeneration = ++resultOperationGeneration.current;
      sectionDraftRef.current = null;
      updateResult({
        ...EMPTY_RESULT,
        activeResultGeneration: operationGeneration,
        lastSpinResult: selectedTarget,
      });

      try {
        const metadata = buildMetadata(selectedTarget);
        const createdSpin = await createSpin({
          user: userId,
          project: selectedTarget.targetType === 'diamond_project' ? selectedTarget.id : undefined,
          project_title: selectedTarget.title,
          project_company:
            typeof selectedTarget.selectedMetadata.company === 'string'
              ? selectedTarget.selectedMetadata.company
              : undefined,
          project_artist:
            typeof selectedTarget.selectedMetadata.artist === 'string'
              ? selectedTarget.selectedMetadata.artist
              : undefined,
          selected_projects: Array.from(selectedTargetIds),
          metadata,
        });

        if (operationGeneration !== resultOperationGeneration.current) return;

        const latestSection = sectionDraftRef.current;
        const persistedMetadata = createdSpin.metadata ?? metadata;
        const latestMetadata = latestSection
          ? { ...persistedMetadata, section: latestSection }
          : persistedMetadata;
        updateResult({ lastSpinRecordId: createdSpin.id, lastSpinMetadata: latestMetadata });

        if (latestSection) {
          try {
            await persistSectionMetadata({
              userId: userId,
              spinId: createdSpin.id,
              metadata: latestMetadata,
            });
          } catch (error) {
            logger.error('Failed to persist section selected while recording randomizer spin', {
              error,
              spinId: createdSpin.id,
              selectedTargetId: selectedTarget.id,
            });
          }
        }
      } catch (error) {
        if (operationGeneration === resultOperationGeneration.current) {
          updateResult({ lastSpinRecordId: null, lastSpinMetadata: null });
        }
        logger.error('Failed to record randomizer spin', {
          error,
          selectedTargetId: selectedTarget.id,
          selectedTargetTitle: selectedTarget.title,
        });
      }
    },
    [
      buildMetadata,
      createSpin,
      persistSectionMetadata,
      selectedTargetIds,
      userId,
      spinSession,
      targetsQuery.error,
      targetsQuery.isLoading,
      isLoadingVerticals,
    ]
  );

  const pickRandomPageFromBook = useCallback(
    async (bookTarget: RandomizerTarget) => {
      if (!userId || bookTarget.targetType !== 'coloring_book') return;

      const bookId = bookTarget.selectedMetadata.coloringBook;
      if (typeof bookId !== 'string' || bookId.length === 0) return;

      const operationGeneration = ++resultOperationGeneration.current;
      sectionDraftRef.current = null;
      updateResult({
        isPickingPageFromBook: true,
        pagePickError: null,
        pagePickErrorReason: null,
      });

      try {
        const pageEligibility: RandomizerEligibility = {
          ...eligibility,
          pageStatuses: UNFINISHED_COLORING_PAGE_STATUSES,
        };
        const pageTargets = await listColoringPageTargets(userId, pageEligibility, { bookId });

        if (operationGeneration !== resultOperationGeneration.current) return;

        if (pageTargets.length === 0) {
          updateResult({
            pagePickError: 'No unfinished pages match this book yet.',
            pagePickErrorReason: 'no_matching_pages',
          });
          return;
        }

        const selectedPage = pageTargets[Math.floor(Math.random() * pageTargets.length)];
        const selectedPageIds = pageTargets.map(target => target.id);
        const metadata = buildMetadata(selectedPage, undefined, {
          mode: 'coloring-page',
          eligibility: pageEligibility,
          selectedTargetIds: selectedPageIds,
          selectedTargets: pageTargets,
        });

        updateResult({
          lastSpinResult: selectedPage,
          activeResultGeneration: operationGeneration,
          sectionDraft: null,
          lastSpinRecordId: null,
          lastSpinMetadata: null,
        });

        try {
          const createdSpin = await createSpin({
            user: userId,
            project_title: selectedPage.title,
            selected_projects: selectedPageIds,
            metadata,
          });

          if (operationGeneration !== resultOperationGeneration.current) return;

          updateResult({
            lastSpinRecordId: createdSpin.id,
            lastSpinMetadata: createdSpin.metadata ?? metadata,
          });
        } catch (error) {
          if (operationGeneration === resultOperationGeneration.current) {
            updateResult({ lastSpinRecordId: null, lastSpinMetadata: null });
          }
          logger.error('Failed to record scoped coloring page randomizer spin', {
            error,
            selectedTargetId: selectedPage.id,
            selectedTargetTitle: selectedPage.title,
            sourceBookId: bookId,
          });
        }
      } catch (error) {
        if (operationGeneration === resultOperationGeneration.current) {
          updateResult({
            pagePickError: 'Could not pick a page from this book. Please try again.',
            pagePickErrorReason: getStructuredErrorReason(error) ?? 'page_pick_failed',
          });
        }
        logger.error('Failed to pick random coloring page from book', {
          error,
          sourceBookId: bookId,
        });
      } finally {
        if (operationGeneration === resultOperationGeneration.current) {
          updateResult({ isPickingPageFromBook: false });
        }
      }
    },
    [buildMetadata, createSpin, eligibility, listColoringPageTargets, userId]
  );

  const handleSectionChange = useCallback(
    async (section: RandomizerSection) => {
      if (
        activeResultGeneration === null ||
        activeResultGeneration !== resultOperationGeneration.current
      ) {
        return;
      }

      sectionDraftRef.current = section;
      updateResult({ sectionDraft: section });

      if (!userId || !lastSpinRecordId || !lastSpinMetadata) return;

      const nextMetadata = {
        ...lastSpinMetadata,
        section,
      };

      updateResult({ lastSpinMetadata: nextMetadata });

      await persistSectionMetadata({
        userId: userId,
        spinId: lastSpinRecordId,
        metadata: nextMetadata,
      });
    },
    [activeResultGeneration, lastSpinMetadata, lastSpinRecordId, persistSectionMetadata, userId]
  );

  const setSectionDraft = useCallback((value: SetStateAction<RandomizerSection | null>) => {
    updateResult(state => ({
      sectionDraft: typeof value === 'function' ? value(state.sectionDraft) : value,
    }));
  }, []);

  const clearLastResult = useCallback(() => {
    setSpinRevision(value => value + 1);
    resultOperationGeneration.current += 1;
    sectionDraftRef.current = null;
    updateResult(EMPTY_RESULT);
  }, []);

  const stats = useMemo(() => {
    const totalTargets = availableTargets.length;
    const selectedCount = selectedTargetIds.size;

    return {
      totalProjects: totalTargets,
      totalTargets,
      selectedCount,
      canSpin:
        selectedCount >= 1 && !targetsQuery.isLoading && !targetsQuery.error && !isLoadingVerticals,
      hasProjects: totalTargets > 0,
      hasTargets: totalTargets > 0,
      hasSelection: selectedCount > 0,
    };
  }, [
    availableTargets.length,
    targetsQuery.isLoading,
    targetsQuery.error,
    isLoadingVerticals,
    selectedTargetIds.size,
  ]);

  return {
    mode: normalizedMode,
    spinSessionKey,
    eligibility,
    availableTargets,
    selectedTargets,
    selectedTargetIds,
    lastSpinResult,
    sectionDraft,
    stats,
    isLoadingTargets: (targetsQuery.isLoading && settledTargets.length === 0) || isLoadingVerticals,
    isPickingPageFromBook,
    error: targetsQuery.error,
    pagePickError,
    pagePickErrorReason,
    setMode,
    updateEligibility,
    resetEligibility,
    toggleTarget,
    selectAllTargets,
    selectNoTargets,
    handleSpinComplete,
    handleSectionChange,
    pickRandomPageFromBook,
    clearLastResult,
    setSectionDraft,
  };
};
