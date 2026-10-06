import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ColoringService,
  type ColoringPageDTO,
  type UpdateColoringPageInput,
} from '@/services/pocketbase/coloring.service';
import {
  beginColoringPageMutation,
  cacheUpdatedColoringPage,
  getCachedColoringPage,
  refreshSettledColoringPage,
  restoreColoringPage,
} from '@/hooks/mutations/coloring/coloringMutationCache';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import { getColoringPageAnalyticsProperties } from '@/services/coloring-analytics';
import { trackGrowthFunnelMilestone } from '@/services/growth-funnel-analytics';
import { useAuth } from '@/hooks/useAuth';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { getCurrentDateInUserTimezone } from '@/utils/date/timezoneUtils';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';
import { runPostWriteEffect } from '@/hooks/mutations/runPostWriteEffect';
import { createLogger } from '@/utils/logger';
import {
  assertColoringPageLifecycleDateRange,
  buildColoringPagePatch,
  getColoringPageCommandEffects,
  type ColoringPageCommand,
  type ColoringPageCommandEffects,
} from '@/features/coloring-progress/coloringProgressCommands';

interface Context {
  previousPage?: ColoringPageDTO;
  patch?: UpdateColoringPageInput;
  effects: ColoringPageCommandEffects;
}

const logger = createLogger('useUpdateColoringPage');

export type { ColoringPageCommand };

interface UpdateColoringPageVariables {
  pageId: string;
  command: ColoringPageCommand;
}

export function useUpdateColoringPage() {
  const queryClient = useQueryClient();
  const userTimezone = useUserTimezone();
  const { user } = useAuth();
  return useMutation<ColoringPageDTO, Error, UpdateColoringPageVariables, Context>({
    mutationFn: ({ pageId, command }) => {
      const currentPage = getCachedColoringPage(queryClient, pageId);
      assertColoringPageLifecycleDateRange(
        command,
        currentPage,
        getCurrentDateInUserTimezone(userTimezone)
      );
      if (command.type === 'set-main-photo') {
        return ColoringService.setMainPagePhoto(pageId, command.filename);
      }
      return ColoringService.updatePage(pageId, buildColoringPagePatch(command));
    },
    onMutate: async ({ pageId, command }) => {
      const patch = command.type === 'set-main-photo' ? undefined : buildColoringPagePatch(command);
      const effects = getColoringPageCommandEffects(command);
      const previousPage = await beginColoringPageMutation(queryClient, pageId, patch, effects);
      return { previousPage, patch, effects };
    },
    onSuccess: (data, variables, context) => {
      runPostWriteEffect(logger, 'Coloring page Stats refresh failed after update', () => {
        invalidateStatsQueries(queryClient, 'coloring');
      });
      const effects = context?.effects ?? getColoringPageCommandEffects(variables.command);
      cacheUpdatedColoringPage(queryClient, data, effects);
      if (effects.shouldTrackStatusChange && data.status !== context?.previousPage?.status) {
        capture(
          AnalyticsEvent.COLORING_PAGE_STATUS_CHANGED,
          getColoringPageAnalyticsProperties(data, context?.patch, {
            surface: 'coloring_page_detail',
            previous_status: context?.previousPage?.status,
            status: data.status,
          })
        );
      }

      if (effects.shouldTrackPhotoDelta) {
        const previousCount = context?.previousPage?.photos.length ?? 0;
        const nextCount = data.photos.length;
        const delta = nextCount - previousCount;
        if (delta > 0) {
          capture(
            AnalyticsEvent.COLORING_PAGE_PHOTO_ADDED,
            getColoringPageAnalyticsProperties(data, undefined, {
              surface: 'coloring_page_detail',
              photo_delta: delta,
            })
          );
          trackGrowthFunnelMilestone({
            userId: user?.id,
            event: AnalyticsEvent.FIRST_PHOTO_ADDED,
            properties: {
              craft: 'coloring',
              entity_type: 'coloring_page_photo',
              source_surface: 'coloring_page_detail',
              photo_delta: delta,
            },
            activationSignal: 'photo_added',
          });
        } else if (delta < 0) {
          capture(
            AnalyticsEvent.COLORING_PAGE_PHOTO_DELETED,
            getColoringPageAnalyticsProperties(data, undefined, {
              surface: 'coloring_page_detail',
              photo_delta: delta,
            })
          );
        }
      }

      if (effects.shouldTrackMysteryReveal) {
        capture(
          AnalyticsEvent.COLORING_MYSTERY_PAGE_REVEALED,
          getColoringPageAnalyticsProperties(data, context?.patch, {
            surface: 'coloring_page_detail',
          })
        );
      }
    },
    onError: (_error, variables, context) => {
      restoreColoringPage(queryClient, variables.pageId, context?.previousPage);
    },
    onSettled: (_data, _error, variables) => {
      const effects = getColoringPageCommandEffects(variables.command);
      refreshSettledColoringPage(queryClient, variables.pageId, effects);
    },
  });
}
