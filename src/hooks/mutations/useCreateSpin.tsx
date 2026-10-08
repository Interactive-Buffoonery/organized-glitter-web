import { notify } from '@/lib/notifications';

/**
 * @fileoverview Enhanced React Query mutation hook for creating randomizer spin records
 *
 * Provides a comprehensive React Query mutation for recording randomizer wheel spins with
 * enhanced error handling, optimistic updates, and comprehensive error classification.
 *
 * @author @serabi
 * @version 2.0.0
 * @since 2025-07-19
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSpinEnhanced } from '@/services/pocketbase/randomizerService';
import { randomizerQueryKeys } from '@/hooks/queries/useSpinHistory';

import { createLogger } from '@/utils/logger';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import type { RandomizerSpinsResponse, IsoAutoDateString } from '@/types/pocketbase.types';
import { Collections } from '@/types/pocketbase.types';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import type { RandomizerSpinMetadata } from '@/types/randomizer';

const logger = createLogger('useCreateSpin');

/**
 * Parameters for creating spin records.
 */
export interface CreateSpinMutationParams {
  /** User ID performing the spin */
  user: string;
  /** Selected project ID */
  project?: string;
  /** Project title for preservation */
  project_title: string;
  /** Project company name for preservation (optional) */
  project_company?: string;
  /** Project artist name for preservation (optional) */
  project_artist?: string;
  /** Array of all projects that were selectable */
  selected_projects: string[];
  /** Generic target snapshot for multi-craft randomizer spins */
  metadata?: RandomizerSpinMetadata;
}

/**
 * Error classification for user-facing feedback and retry decisions.
 * `type` is the fine-grained randomizer classification carried in
 * error.details.randomizerType by the service.
 */
interface ClassifiedError {
  type: string;
  canRetry: boolean;
  suggestedAction: string;
  requiresUserAction: boolean;
}

function classifyError(error: unknown): ClassifiedError {
  if (ErrorHandler.isPocketBaseError(error)) {
    const details = (error.details ?? {}) as {
      randomizerType?: string;
      canRetry?: boolean;
      suggestedAction?: string;
    };

    const canRetry = details.canRetry ?? error.retryable;
    const randomizerType = details.randomizerType ?? error.type.toUpperCase();
    const suggestedAction = details.suggestedAction ?? 'Please try again in a moment';

    return {
      type: randomizerType,
      canRetry,
      suggestedAction,
      requiresUserAction: !canRetry,
    };
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch')) {
      return {
        type: 'NETWORK_ERROR',
        canRetry: true,
        suggestedAction: 'Check your internet connection and try again',
        requiresUserAction: false,
      };
    }

    if (message.includes('permission') || message.includes('unauthorized')) {
      return {
        type: 'PERMISSION_DENIED',
        canRetry: false,
        suggestedAction: 'Please log in again',
        requiresUserAction: true,
      };
    }

    if (message.includes('validation') || message.includes('invalid')) {
      return {
        type: 'VALIDATION_ERROR',
        canRetry: false,
        suggestedAction: 'Please check your selection and try again',
        requiresUserAction: true,
      };
    }
  }

  return {
    type: 'DATABASE_UNAVAILABLE',
    canRetry: true,
    suggestedAction: 'Please try again in a moment',
    requiresUserAction: false,
  };
}

/**
 * Enhanced React Query mutation hook for creating randomizer spin records
 *
 * Provides a comprehensive mutation for recording wheel spin results with enhanced error
 * handling, optimistic updates, and safe failure recovery. Uses the
 * TypedRandomizerService for improved type safety and error classification.
 *
 * @returns {UseMutationResult} Enhanced React Query mutation object with:
 *   - mutate: Function to trigger the mutation
 *   - mutateAsync: Async version that returns a promise
 *   - isPending: Boolean indicating if mutation is in progress
 *   - error: Classified error object with recovery information
 *   - data: The created spin record if successful
 *
 * @example
 * ```typescript
 * function RandomizerComponent() {
 *   const createSpinMutation = useCreateSpin();
 *
 *   const handleSpin = async (selectedProject: Project) => {
 *     try {
 *       await createSpinMutation.mutateAsync({
 *         user: user.id,
 *         project: selectedProject.id,
 *         project_title: selectedProject.title,
 *         project_company: selectedProject.company,
 *         project_artist: selectedProject.artist,
 *         selected_projects: selectedProjectIds
 *       });
 *       // Success toast shown automatically with project name
 *     } catch (error) {
 *       // Enhanced error handling with specific recovery suggestions
 *       console.error('Spin creation failed:', error);
 *     }
 *   };
 *
 *   return (
 *     <button
 *       onClick={() => handleSpin(selectedProject)}
 *       disabled={createSpinMutation.isPending}
 *     >
 *       {createSpinMutation.isPending ? 'Recording...' : 'Spin Wheel'}
 *     </button>
 *   );
 * }
 * ```
 *
 * @features
 * - **Enhanced Error Handling**: Comprehensive error classification and recovery strategies
 * - **Optimistic Updates**: Immediate UI updates with automatic rollback on failure
 * - **No Automatic Replay**: Ambiguous create outcomes are reconciled from history
 * - **Type Safety**: Full TypeScript support with enhanced parameter validation
 * - **Cache Management**: Optimized cache invalidation and prefetching
 * - **User Feedback**: Contextual toast messages with specific error guidance
 *
 * @errorhandling
 * - **Network Errors**: Unknown outcomes prompt the user to check history
 * - **Permission Errors**: Clear user guidance for re-authentication
 * - **Validation Errors**: Specific feedback on data issues
 * - **Database Errors**: Graceful degradation with recovery guidance
 * - **Optimistic Rollback**: Automatic UI state restoration on failure
 * @sideeffects
 * - Invalidates randomizer history and count queries for the user
 * - Shows contextual success/error toast notifications
 * - Logs detailed mutation events for debugging
 * - Updates optimistic cache state during mutation
 */
export const useCreateSpin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      params: CreateSpinMutationParams
    ): Promise<RandomizerSpinsResponse<RandomizerSpinMetadata | null, string[]>> => {
      logger.debug('Creating enhanced spin record', {
        userId: params.user,
        projectId: params.project,
        selectedCount: params.selected_projects.length,
      });

      return await createSpinEnhanced(params);
    },
    onMutate: async variables => {
      // Optimistic update: immediately add the spin to the cache
      logger.debug('Applying optimistic update for spin creation', {
        userId: variables.user,
        projectTitle: variables.project_title,
      });

      // Cancel any outgoing refetches to prevent overwriting our optimistic update
      await queryClient.cancelQueries({
        queryKey: randomizerQueryKeys.history(variables.user),
      });

      // Snapshot the previous value for rollback
      const previousHistory = queryClient.getQueryData(
        randomizerQueryKeys.history(variables.user, 8)
      );

      // Optimistically update the cache with the new spin.
      // RandomizerSpinsResponse = Required<RandomizerSpinsRecord>, so every field is
      // non-optional string here; the source record type allows `undefined`. Coerce
      // missing company/artist to '' so we match the server-returned shape.
      const optimisticSpin: RandomizerSpinsResponse<RandomizerSpinMetadata | null, string[]> = {
        id: `optimistic-${Date.now()}`, // Temporary ID
        user: variables.user,
        project: variables.project || '',
        project_title: variables.project_title,
        project_company: variables.project_company || '',
        project_artist: variables.project_artist || '',
        selected_projects: variables.selected_projects,
        selected_count: variables.selected_projects.length,
        metadata: variables.metadata ?? null,
        spun_at: new Date().toISOString(),
        created: new Date().toISOString() as IsoAutoDateString,
        updated: new Date().toISOString() as IsoAutoDateString,
        collectionId: 'randomizer_spins',
        collectionName: Collections.RandomizerSpins,
      };

      queryClient.setQueryData(
        randomizerQueryKeys.history(variables.user, 8),
        (old: RandomizerSpinsResponse<RandomizerSpinMetadata | null, string[]>[] | undefined) => {
          return old ? [optimisticSpin, ...old.slice(0, 7)] : [optimisticSpin];
        }
      );

      // Update the count optimistically
      queryClient.setQueryData(
        randomizerQueryKeys.count(variables.user),
        (old: number | undefined) => (old || 0) + 1
      );

      // Return context for rollback
      return { previousHistory, optimisticSpin };
    },
    onSuccess: (data, variables, context) => {
      capture(AnalyticsEvent.RANDOMIZER_SPIN, {
        selected_count: variables.selected_projects.length,
        source_surface: 'randomizer',
        mode: variables.metadata?.mode ?? 'diamond',
      });
      logger.info('Enhanced spin record created successfully', {
        spinId: data.id,
        userId: variables.user,
        projectTitle: variables.project_title,
      });

      // Replace optimistic update with real data
      queryClient.setQueryData(
        randomizerQueryKeys.history(variables.user, 8),
        (old: RandomizerSpinsResponse<RandomizerSpinMetadata | null, string[]>[] | undefined) => {
          if (!old) return [data];

          // Replace the optimistic record with the real one
          return old.map(spin => (spin.id === context?.optimisticSpin.id ? data : spin));
        }
      );

      // Invalidate related queries to ensure consistency
      queryClient.invalidateQueries({
        queryKey: randomizerQueryKeys.all,
      });

      // Show success toast with enhanced information
      notify({
        kind: 'info',
        title: 'Spin recorded!',
        description: `Selected: ${variables.project_title}${
          variables.project_company ? ` by ${variables.project_company}` : ''
        }`,
      });
    },
    onError: (error, variables, context) => {
      const classifiedError = classifyError(error);

      logger.error('Failed to create enhanced spin record', {
        error,
        errorType: classifiedError.type,
        canRetry: classifiedError.canRetry,
        userId: variables.user,
        projectId: variables.project,
        projectTitle: variables.project_title,
      });

      // Rollback optimistic update
      if (context?.previousHistory !== undefined) {
        queryClient.setQueryData(
          randomizerQueryKeys.history(variables.user, 8),
          context.previousHistory
        );
      }

      // Rollback count update
      queryClient.setQueryData(
        randomizerQueryKeys.count(variables.user),
        (old: number | undefined) => Math.max((old || 1) - 1, 0)
      );

      if (classifiedError.canRetry) {
        queryClient.invalidateQueries({ queryKey: randomizerQueryKeys.all });
        notify({
          kind: 'warning',
          title: 'Spin history status unknown',
          description: 'Check your spin history before recording this result again.',
        });
        return;
      }

      // Show contextual error toast based on error classification
      const errorTitle = classifiedError.requiresUserAction
        ? 'Action Required'
        : 'Failed to record spin';

      notify({ kind: 'error', title: errorTitle, description: classifiedError.suggestedAction });
    },
    retry: false,
  });
};
