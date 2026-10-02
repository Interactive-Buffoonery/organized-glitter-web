import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';
import { notify } from '@/lib/notifications';
import { isRecordInUseError } from '@/services/errors';
import { ColoringMediumsService } from '@/services/pocketbase/coloringMediums.service';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import type { ColoringMediumFormValues, ColoringMediumRecord } from '@/types/coloringMedium';
import { createLogger } from '@/utils/logger';
import {
  mergeUpdatedColoringMediumIntoCache,
  type ColoringMediumListCache,
} from './coloringMediumMutationCache';

const logger = createLogger('useColoringMediumMutations');
const colorCountBucket = (colorCount: number): string => {
  if (colorCount <= 0) return '0';
  if (colorCount <= 12) return '1-12';
  if (colorCount <= 24) return '13-24';
  if (colorCount <= 48) return '25-48';
  if (colorCount <= 72) return '49-72';
  return '73+';
};

const getColoringMediumAnalyticsProperties = (medium: ColoringMediumRecord) => ({
  type: medium.type,
  has_brand: medium.brand.trim().length > 0,
  has_notes: medium.notes.trim().length > 0,
  color_count_bucket: colorCountBucket(medium.colorCount),
});

export function useCreateColoringMedium() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ColoringMediumFormValues) =>
      ColoringMediumsService.createColoringMedium(input),
    onSuccess: medium => {
      capture(AnalyticsEvent.COLORING_MEDIUM_CREATED, getColoringMediumAnalyticsProperties(medium));
      queryClient.invalidateQueries({ queryKey: queryKeys.coloring.mediums.all });
    },
  });
}

export function useUpdateColoringMedium() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ColoringMediumFormValues> }) =>
      ColoringMediumsService.updateColoringMedium(id, input),
    onSuccess: medium => {
      capture(AnalyticsEvent.COLORING_MEDIUM_UPDATED, getColoringMediumAnalyticsProperties(medium));
      invalidateStatsQueries(queryClient, 'coloring');
      queryClient.setQueriesData<ColoringMediumListCache>(
        { queryKey: queryKeys.coloring.mediums.all },
        cached => mergeUpdatedColoringMediumIntoCache(cached, medium)
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.coloring.mediums.all });
    },
  });
}

export function useDeleteColoringMedium() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ColoringMediumsService.deleteColoringMedium(id),
    onSuccess: () => {
      capture(AnalyticsEvent.COLORING_MEDIUM_DELETED);
      invalidateStatsQueries(queryClient, 'coloring');
      queryClient.invalidateQueries({ queryKey: queryKeys.coloring.mediums.all });
    },
    onError: error => {
      logger.error('Error deleting coloring medium:', error);
      const isInUse = isRecordInUseError(error);
      notify({
        kind: 'error',
        title: isInUse ? 'Coloring medium is in use' : 'Coloring medium deletion failed',
        description: isInUse
          ? 'Remove it from coloring pages before deleting it.'
          : 'Could not delete coloring medium. Please try again.',
      });
    },
  });
}
