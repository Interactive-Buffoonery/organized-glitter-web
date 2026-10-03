/**
 * Auto-save mutation for coloring navigation context.
 *
 * Sibling of `useSaveNavigationContext` (diamond). Writes to the
 * `coloring_navigation_context` JSON column on `user_dashboard_settings` so
 * coloring filter persistence is fully isolated from diamond's
 * `navigation_context` column.
 *
 * @author serabi
 */

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { DashboardSettingsService } from '@/services/pocketbase/dashboardSettings.service';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { onAuthChange } from '@/services/auth';
import { createLogger } from '@/utils/logger';
import type { PersistedColoringFilterState } from '@/contexts/ColoringFilterContext';

const logger = createLogger('useSaveColoringNavigationContext');

export interface ColoringNavigationContext {
  filters: PersistedColoringFilterState;
  preservationContext?: {
    scrollPosition: number;
    timestamp: number;
  };
}

const CACHE_MAX_SIZE = 100;
const settingsIdCache = new Map<string, string>();

interface OptimisticSaveState {
  confirmedContext: ColoringNavigationContext | null | undefined;
  hadConfirmedContext: boolean;
  nextToken: number;
  pendingTokens: Set<number>;
}

const optimisticSaveStates = new WeakMap<QueryClient, Map<string, OptimisticSaveState>>();

const getOptimisticSaveStates = (queryClient: QueryClient) => {
  let states = optimisticSaveStates.get(queryClient);
  if (!states) {
    states = new Map();
    optimisticSaveStates.set(queryClient, states);
  }
  return states;
};

const setCacheEntry = (userId: string, id: string) => {
  if (settingsIdCache.size >= CACHE_MAX_SIZE && !settingsIdCache.has(userId)) {
    const firstKey = settingsIdCache.keys().next().value as string | undefined;
    if (firstKey) settingsIdCache.delete(firstKey);
  }
  settingsIdCache.set(userId, id);
};

let lastUserId: string | null = null;

onAuthChange((_token, record) => {
  const currentId = record?.id ?? null;
  if (lastUserId && currentId !== lastUserId) {
    settingsIdCache.delete(lastUserId);
  }
  lastUserId = currentId;
}, true);

interface SaveColoringNavigationContextParams {
  userId: string;
  navigationContext: ColoringNavigationContext;
}

const saveColoringNavigationContext = async ({
  userId,
  navigationContext,
}: SaveColoringNavigationContextParams): Promise<void> => {
  if (!userId) {
    throw new Error('User ID is required');
  }
  if (!navigationContext) {
    throw new Error('Coloring navigation context is required');
  }

  const startTime = performance.now();
  try {
    const cachedId = settingsIdCache.get(userId);
    const recordId = await DashboardSettingsService.saveColoringNavigationContext(
      userId,
      navigationContext,
      cachedId
    );
    setCacheEntry(userId, recordId);
    logger.info(
      `Saved coloring navigation context in ${Math.round(performance.now() - startTime)}ms`
    );
  } catch (error) {
    settingsIdCache.delete(userId);
    logger.error('Error saving coloring navigation context:', error);
    throw error;
  }
};

export const useSaveColoringNavigationContext = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveColoringNavigationContext,
    mutationKey: ['saveColoringNavigationContext', userId],
    scope: { id: `saveColoringNavigationContext:${userId}` },
    onMutate: variables => {
      const queryKey = queryKeys.dashboardSettings.coloringNavigationContext(variables.userId);
      const states = getOptimisticSaveStates(queryClient);
      let state = states.get(variables.userId);
      if (!state) {
        const confirmedContext = queryClient.getQueryData<ColoringNavigationContext | null>(
          queryKey
        );
        state = {
          confirmedContext,
          hadConfirmedContext: confirmedContext !== undefined,
          nextToken: 0,
          pendingTokens: new Set(),
        };
        states.set(variables.userId, state);
      }
      const token = ++state.nextToken;
      state.pendingTokens.add(token);
      queryClient.setQueryData(queryKey, variables.navigationContext);
      return { queryKey, state, states, token };
    },
    onSuccess: (_, variables, mutationContext) => {
      if (mutationContext) {
        mutationContext.state.confirmedContext = variables.navigationContext;
        mutationContext.state.hadConfirmedContext = true;
        mutationContext.state.pendingTokens.delete(mutationContext.token);
        if (mutationContext.state.pendingTokens.size === 0) {
          queryClient.setQueryData(mutationContext.queryKey, variables.navigationContext);
          mutationContext.states.delete(variables.userId);
        }
      }
      logger.info(`Successfully saved coloring navigation context for user ${variables.userId}`);
    },
    onError: (error, variables, mutationContext) => {
      if (mutationContext) {
        mutationContext.state.pendingTokens.delete(mutationContext.token);
        if (mutationContext.state.pendingTokens.size === 0) {
          if (mutationContext.state.hadConfirmedContext) {
            queryClient.setQueryData(
              mutationContext.queryKey,
              mutationContext.state.confirmedContext
            );
          } else {
            queryClient.removeQueries({ queryKey: mutationContext.queryKey, exact: true });
          }
          mutationContext.states.delete(variables.userId);
        }
      }
      logger.error(
        `Failed to save coloring navigation context for user ${variables.userId}:`,
        error
      );
    },
    retry: false,
    meta: { timeout: 5000 },
  });
};
