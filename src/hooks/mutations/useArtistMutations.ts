import { notify } from '@/lib/notifications';

/**
 * Artist mutation hooks delegating to ArtistsService
 * @author @serabi
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ArtistDTO } from '@/services/types';
import { ArtistsService, type ArtistListItem } from '@/services/pocketbase/artists.service';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';
import { isRecordInUseError, isServiceError } from '@/services/errors';
import { createLogger } from '@/utils/logger';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import { isSessionChangedError } from '@/services/auth/sessionRecovery';

const logger = createLogger('ArtistMutations');

/**
 * Merges an updated artist into cached `ArtistListItem[]` queries so the table
 * reflects the new name before the background refetch resolves (same class as #108).
 * Exported for unit tests.
 */
export function mergeUpdatedArtistIntoArtistQueriesCache(
  data: unknown,
  id: string,
  patch: Pick<ArtistListItem, 'name'>
): unknown {
  if (!Array.isArray(data)) return data;

  let changed = false;
  const next = (data as ArtistListItem[]).map(item => {
    if (item.id === id) {
      changed = true;
      return { ...item, ...patch };
    }
    return item;
  });
  if (!changed) return data;
  return next.sort((a, b) => a.name.localeCompare(b.name));
}

export function insertCreatedArtistIntoArtistQueriesCache(
  data: unknown,
  created: ArtistListItem
): unknown {
  if (!Array.isArray(data)) return data;
  if ((data as ArtistListItem[]).some(item => item.id === created.id)) return data;
  return [...(data as ArtistListItem[]), created].sort((a, b) => a.name.localeCompare(b.name));
}

export interface CreateArtistData {
  name: string;
}

export interface UpdateArtistData {
  name?: string;
}

export function useCreateArtist({ notifyOnSuccess = true }: { notifyOnSuccess?: boolean } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateArtistData): Promise<ArtistDTO> => {
      return ArtistsService.create(data);
    },
    onSuccess: created => {
      capture(AnalyticsEvent.ARTIST_CREATED);
      queryClient.setQueriesData({ queryKey: queryKeys.artists.all }, cached =>
        insertCreatedArtistIntoArtistQueriesCache(cached, {
          id: created.id,
          name: created.name,
        })
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.artists.all });

      if (notifyOnSuccess) {
        notify({
          kind: 'success',
          title: 'Artist created',
          description: `Artist "${created.name}" has been added`,
        });
      }
      logger.info('Artist created', { id: created.id });
    },
    onError: (error: Error) => {
      if (isSessionChangedError(error)) return;
      logger.error('Failed to create artist', error);
      const message =
        isServiceError(error) && error.type === 'validation'
          ? error.message
          : 'Failed to add artist';
      notify({ kind: 'error', title: 'Artist creation failed', description: message });
    },
  });
}

export function useUpdateArtist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateArtistData;
    }): Promise<ArtistDTO> => {
      return ArtistsService.update(id, data);
    },
    onSuccess: (updated, { id }) => {
      invalidateStatsQueries(queryClient, 'diamond');
      capture(AnalyticsEvent.ARTIST_UPDATED);
      queryClient.setQueriesData({ queryKey: queryKeys.artists.all }, cached =>
        mergeUpdatedArtistIntoArtistQueriesCache(cached, id, { name: updated.name })
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.artists.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.artists.detail(id) });

      notify({
        kind: 'success',
        title: 'Artist updated',
        description: `Artist "${updated.name}" has been updated`,
      });
      logger.info('Artist updated', { id });
    },
    onError: (error: Error) => {
      logger.error('Failed to update artist', error);
      const message =
        isServiceError(error) && (error.type === 'validation' || error.type === 'permission')
          ? error.message
          : 'Failed to update artist';
      notify({ kind: 'error', title: 'Artist update failed', description: message });
    },
  });
}

export function useDeleteArtist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<void> => {
      return ArtistsService.delete(id);
    },
    onSuccess: (_, { id }) => {
      invalidateStatsQueries(queryClient, 'diamond');
      capture(AnalyticsEvent.ARTIST_DELETED);
      queryClient.invalidateQueries({ queryKey: queryKeys.artists.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.artists.detail(id) });

      notify({ kind: 'success', title: 'Artist deleted', description: 'Artist has been deleted' });
      logger.info('Artist deleted', { id });
    },
    onError: (error: Error) => {
      logger.error('Failed to delete artist', error);
      const isInUse = isRecordInUseError(error);
      const message = isInUse
        ? 'Remove it from projects before deleting it.'
        : isServiceError(error) && error.type === 'permission'
          ? error.message
          : 'Failed to delete artist';
      notify({
        kind: 'error',
        title: isInUse ? 'Artist is in use' : 'Artist deletion failed',
        description: message,
      });
    },
  });
}
