import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/hooks/queries/queryKeys';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { notify } from '@/lib/notifications';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import { ColoringPageProgressNotesService } from '@/services/pocketbase/coloringPageProgressNotes.service';
import { handleMutationError } from '@/hooks/mutations/handleMutationError';
import { invalidateNotesFeedQueries } from '@/hooks/queries/notesFeedCache';
import { toUserDateString } from '@/utils/date/timezoneUtils';
import { createLogger } from '@/utils/logger';
import type { MarkdownString } from '@/types/markdown';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';

const logger = createLogger('useColoringPageProgressNotes');

const getPageProgressNoteInvalidations = (pageId: string) => [
  queryKeys.coloring.pageProgressNotes.list(pageId),
  queryKeys.coloring.pages.detail(pageId),
  queryKeys.coloring.pages.all,
  queryKeys.coloring.books.all,
];

const invalidatePageProgressNotes = async (
  queryClient: QueryClient,
  pageId: string,
  affectsOverview = true
) => {
  if (affectsOverview) invalidateStatsQueries(queryClient, 'overview');
  const results = await Promise.allSettled([
    ...getPageProgressNoteInvalidations(pageId).map(queryKey =>
      queryClient.invalidateQueries({ queryKey })
    ),
    invalidateNotesFeedQueries(queryClient),
  ]);

  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length > 0) {
    logger.error('Could not refresh coloring page progress notes after save:', failures);
  }
};

export const useAddColoringPageProgressNoteMutation = () => {
  const queryClient = useQueryClient();
  const userTimezone = useUserTimezone();

  return useMutation({
    mutationFn: async ({
      pageId,
      noteData,
    }: {
      pageId: string;
      noteData: { date: string; content: MarkdownString; imageFile?: File };
    }) => {
      const convertedDate = (() => {
        if (!noteData.date) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(noteData.date)) return noteData.date;
        return toUserDateString(noteData.date, userTimezone) || '';
      })();

      return ColoringPageProgressNotesService.create({
        page: pageId,
        content: noteData.content,
        date: convertedDate,
        imageFile: noteData.imageFile,
      });
    },
    onSuccess: (_, { pageId, noteData }) => {
      capture(AnalyticsEvent.COLORING_PAGE_PROGRESS_NOTE_ADDED, {
        craft: 'coloring',
        entity_type: 'coloring_page_progress_note',
        source_surface: 'coloring_page_detail',
        has_photo: Boolean(noteData.imageFile),
      });
      void invalidatePageProgressNotes(queryClient, pageId).catch(error => {
        logger.error('Could not refresh coloring page progress notes after save:', error);
      });

      notify({
        kind: 'success',
        title: 'Progress note added',
        description: 'Progress note added successfully',
      });
    },
    onError: error => {
      handleMutationError(error, 'add coloring page progress note');
    },
  });
};

export const useUpdateColoringPageProgressNoteMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      content,
    }: {
      noteId: string;
      pageId: string;
      content: MarkdownString;
    }) => {
      return ColoringPageProgressNotesService.updateContent(noteId, content);
    },
    onSuccess: async (_, { pageId }) => {
      capture(AnalyticsEvent.COLORING_PAGE_PROGRESS_NOTE_UPDATED);
      await invalidatePageProgressNotes(queryClient, pageId, false);

      notify({
        kind: 'success',
        title: 'Progress note updated',
        description: 'Progress note updated successfully',
      });
    },
    onError: error => {
      handleMutationError(error, 'update coloring page progress note');
    },
  });
};

export const useDeleteColoringPageProgressNoteMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId }: { noteId: string; pageId: string }) => {
      return ColoringPageProgressNotesService.delete(noteId);
    },
    onSuccess: async (_, { pageId }) => {
      capture(AnalyticsEvent.COLORING_PAGE_PROGRESS_NOTE_DELETED);
      await invalidatePageProgressNotes(queryClient, pageId);

      notify({
        kind: 'success',
        title: 'Progress note deleted',
        description: 'Progress note deleted successfully',
      });
    },
    onError: error => {
      handleMutationError(error, 'delete coloring page progress note');
    },
  });
};

export const useDeleteColoringPageProgressNoteImageMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId }: { noteId: string; pageId: string }) => {
      return ColoringPageProgressNotesService.removeImage(noteId);
    },
    onSuccess: async (_, { pageId }) => {
      await invalidatePageProgressNotes(queryClient, pageId, false);

      notify({
        kind: 'success',
        title: 'Progress note image removed',
        description: 'Progress note image removed successfully',
      });
    },
    onError: error => {
      handleMutationError(error, 'remove coloring page progress note image');
    },
  });
};
