import { notify } from '@/lib/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ProgressNotesService } from '@/services/pocketbase/progressNotes.service';
import { projectsService } from '@/services/pocketbase/projects.service';
import { ProjectStatus } from '@/types/project';
import { queryKeys } from '@/hooks/queries/queryKeys';

import { useAuth } from '@/hooks/useAuth';
import { createLogger } from '@/utils/logger';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { toUserDateString } from '@/utils/date/timezoneUtils';
import type { MarkdownString } from '@/types/markdown';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import { trackGrowthFunnelMilestone } from '@/services/growth-funnel-analytics';
import {
  invalidateProjectDetailAndProgressNotes,
  patchProjectInLists,
  removeProjectFromLists,
} from '@/hooks/mutations/projectCache';
import { invalidateNotesFeedQueries } from '@/hooks/queries/notesFeedCache';
import { buildUpdateProjectFormData } from '@/hooks/mutations/projectMutationAdapters';
import { handleMutationError } from '@/hooks/mutations/handleMutationError';
import { useProjectFieldUpdateMutation } from '@/hooks/mutations/useProjectFieldUpdateMutation';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';
import { logFormData, validateFormDataForUpdate } from '@/utils/project/formdata-builder';
import { getDateFieldSelectedDate } from '@/components/ui/date-field-utils';
import {
  UpdateProjectDatesSectionInput,
  UpdateProjectNotesSectionInput,
} from '@/hooks/mutations/projectCommands';

const logger = createLogger('useProjectDetailMutations');

type ProjectDateOrderReason = 'invalid_date' | 'start_before_purchase' | 'completion_before_start';

class ProjectDateOrderError extends Error {
  constructor(
    readonly reason: ProjectDateOrderReason,
    message: string
  ) {
    super(message);
    this.name = 'ProjectDateOrderError';
  }
}

const buildSectionFormData = async (
  input: UpdateProjectDatesSectionInput,
  userId: string,
  userTimezone: string
) => {
  const formData = await buildUpdateProjectFormData(input, userId, userTimezone);
  const validation = validateFormDataForUpdate(formData, []);

  if (!validation.isValid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  return formData;
};

// Constants for project status values
const PROJECT_STATUS = {
  ARCHIVED: 'archived' as const,
} satisfies Record<string, ProjectStatus>;

export const useUpdateProjectDatesSectionMutation = () =>
  useProjectFieldUpdateMutation<UpdateProjectDatesSectionInput>({
    label: 'dates',
    currentFields: ['status', 'date_purchased', 'date_started', 'date_completed'],
    validateInput: input => {
      for (const value of [
        input.datePurchased,
        input.dateReceived,
        input.dateStarted,
        input.dateCompleted,
      ]) {
        if (value && !getDateFieldSelectedDate(value)) {
          throw new ProjectDateOrderError('invalid_date', 'Enter a valid date');
        }
      }
    },
    buildFormDataFromCurrent: async (input, { userId, userTimezone }, current) => {
      const datePurchased =
        input.datePurchased === undefined ? current.datePurchased : input.datePurchased;
      const dateStarted = input.dateStarted === undefined ? current.dateStarted : input.dateStarted;
      const dateCompleted =
        input.dateCompleted === undefined ? current.dateCompleted : input.dateCompleted;
      if (datePurchased && dateStarted && dateStarted < datePurchased) {
        throw new ProjectDateOrderError(
          'start_before_purchase',
          'Start date cannot be before purchase date'
        );
      }
      if (dateStarted && dateCompleted && dateCompleted < dateStarted) {
        throw new ProjectDateOrderError(
          'completion_before_start',
          'Completion date cannot be before start date'
        );
      }
      const formData = await buildSectionFormData(input, userId, userTimezone);
      logFormData(formData, `Project Dates Section Update: ${input.projectId}`);
      return formData;
    },
    optimisticPatch: ({ datePurchased, dateStarted, dateCompleted, dateReceived }) => ({
      ...(datePurchased !== undefined ? { datePurchased } : {}),
      ...(dateStarted !== undefined ? { dateStarted } : {}),
      ...(dateCompleted !== undefined ? { dateCompleted } : {}),
      ...(dateReceived !== undefined ? { dateReceived } : {}),
    }),
    serverPatch: ({ status }) => ({ status }),
  });

export const useUpdateProjectNotesSectionMutation = () =>
  useProjectFieldUpdateMutation<UpdateProjectNotesSectionInput>({
    label: 'notes',
    statsInvalidation: 'overview',
    buildFormData: async ({ notes }) => {
      // Notes are a plain string field; FormData keeps the contract uniform
      // with the other section mutations even though a JSON object would
      // also work.
      const formData = new FormData();
      formData.append('general_notes', notes);
      return formData;
    },
    optimisticPatch: ({ notes }) => ({ generalNotes: notes }),
    successNotify: {
      title: 'Project notes updated',
      description: 'Project notes updated successfully',
    },
  });

/**
 * Mutation hook for adding a progress note
 */
export const useAddProgressNoteMutation = () => {
  const queryClient = useQueryClient();
  const userTimezone = useUserTimezone();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      projectId,
      noteData,
    }: {
      projectId: string;
      noteData: { date: string; content: MarkdownString; imageFile?: File };
    }) => {
      // Convert date: YYYY-MM-DD strings are kept as-is to avoid double timezone conversion
      const convertedDate = (() => {
        if (!noteData.date || noteData.date === '') return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(noteData.date)) return noteData.date;
        return toUserDateString(noteData.date, userTimezone) || '';
      })();

      return await ProgressNotesService.create({
        project: projectId,
        content: noteData.content,
        date: convertedDate,
        imageFile: noteData.imageFile,
      });
    },
    onSuccess: async (_, { projectId, noteData }) => {
      invalidateStatsQueries(queryClient, 'overview');
      capture(AnalyticsEvent.PROGRESS_NOTE_ADDED);
      trackGrowthFunnelMilestone({
        userId: user?.id,
        event: AnalyticsEvent.FIRST_PROGRESS_NOTE_ADDED,
        properties: {
          craft: 'diamond',
          entity_type: 'project_progress_note',
          source_surface: 'project_detail',
          has_photo: Boolean(noteData.imageFile),
        },
        activationSignal: 'progress_note_added',
      });
      if (noteData.imageFile) {
        trackGrowthFunnelMilestone({
          userId: user?.id,
          event: AnalyticsEvent.FIRST_PHOTO_ADDED,
          properties: {
            craft: 'diamond',
            entity_type: 'project_progress_note',
            source_surface: 'project_detail',
          },
          activationSignal: 'photo_added',
        });
      }
      const refreshes = await invalidateProjectDetailAndProgressNotes(queryClient, projectId);
      for (const refresh of refreshes) {
        if (refresh.status === 'rejected') {
          logger.error('Could not refresh project progress notes after save:', {
            reason: 'progress_notes_refresh_failed',
            error: refresh.reason,
            projectId,
          });
        }
      }

      notify({
        kind: 'success',
        title: 'Progress note added',
        description: 'Progress note added successfully',
      });
    },
    onError: error => {
      handleMutationError(error, 'add progress note');
    },
  });
};

/**
 * Mutation hook for updating a progress note
 */
export const useUpdateProgressNoteMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      content,
    }: {
      noteId: string;
      projectId: string;
      content: MarkdownString;
    }) => {
      return await ProgressNotesService.updateContent(noteId, content);
    },
    onSuccess: async (_, { projectId }) => {
      await invalidateProjectDetailAndProgressNotes(queryClient, projectId);

      notify({
        kind: 'success',
        title: 'Progress note updated',
        description: 'Progress note updated successfully',
      });
    },
    onError: error => {
      handleMutationError(error, 'update progress note');
    },
  });
};

/**
 * Mutation hook for deleting a progress note
 */
export const useDeleteProgressNoteMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, projectId }: { noteId: string; projectId?: string }) => {
      logger.debug('Deleting progress note:', { noteId, projectId });
      return await ProgressNotesService.delete(noteId);
    },
    onSuccess: async (_, { projectId }) => {
      invalidateStatsQueries(queryClient, 'overview');
      if (projectId) {
        await invalidateProjectDetailAndProgressNotes(queryClient, projectId);
      } else {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.progressNotes.all,
            exact: true,
          }),
          invalidateNotesFeedQueries(queryClient),
          queryClient.invalidateQueries({
            queryKey: queryKeys.projects.details(),
          }),
        ]);
      }

      notify({
        kind: 'success',
        title: 'Progress note deleted',
        description: 'Progress note deleted successfully',
      });

      logger.info('Progress note deleted successfully');
    },
    onError: error => {
      handleMutationError(error, 'delete progress note');
    },
  });
};

/**
 * Mutation hook for removing image from a progress note
 */
export const useDeleteProgressNoteImageMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId, projectId: _ }: { noteId: string; projectId: string }) => {
      return await ProgressNotesService.removeImage(noteId);
    },
    onSuccess: async (_, { projectId }) => {
      await invalidateProjectDetailAndProgressNotes(queryClient, projectId);

      notify({
        kind: 'success',
        title: 'Progress note image removed',
        description: 'Progress note image removed successfully',
      });
    },
    onError: error => {
      handleMutationError(error, 'remove progress note image');
    },
  });
};

/**
 * Mutation hook for archiving a project
 */
export const useArchiveProjectMutation = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) => {
      logger.debug('Archiving project:', { projectId });
      return await projectsService.update(projectId, { status: PROJECT_STATUS.ARCHIVED });
    },
    onSuccess: async (_, { projectId }) => {
      logger.info('Project archived successfully:', { projectId });

      if (user?.id) {
        queryClient.setQueriesData(
          { queryKey: queryKeys.projects.lists(), exact: false },
          oldData => patchProjectInLists(oldData, projectId, { status: PROJECT_STATUS.ARCHIVED })
        );

        queryClient.setQueryData(queryKeys.projects.detail(projectId), (oldData: unknown) => {
          if (!oldData || typeof oldData !== 'object') return oldData;
          return { ...(oldData as Record<string, unknown>), status: PROJECT_STATUS.ARCHIVED };
        });

        // Optimistic patch above keeps the UI snappy, but dashboard lists
        // scoped by status (e.g. ?status=progress) would otherwise hold a
        // ghost row, the archived project still in the cached result set
        // with its new archived badge, until the stale window elapses.
        // Invalidate list queries so the server filter reflects the archive.
        queryClient.invalidateQueries({
          queryKey: queryKeys.projects.lists(),
          exact: false,
        });
      }
      invalidateStatsQueries(queryClient, 'diamond');
    },
    onError: error => {
      handleMutationError(error, 'archive project');
    },
  });
};

/**
 * Mutation hook for deleting a project
 */
export const useDeleteProjectMutation = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ projectId, title }: { projectId: string; title?: string }) => {
      logger.debug('Deleting project:', { projectId, title });

      // Get project status before deletion for stats update
      const project = await projectsService.getOne(projectId, { fields: 'status' });

      await projectsService.deleteProject(projectId);

      return { deletedProject: project, projectId, title };
    },
    onSuccess: async (_, { projectId, title }) => {
      logger.info('Project deleted successfully:', { projectId, title });

      if (user?.id) {
        await queryClient.cancelQueries({ queryKey: queryKeys.projects.detail(projectId) });

        queryClient.setQueriesData(
          { queryKey: queryKeys.projects.lists(), exact: false },
          oldData => removeProjectFromLists(oldData, projectId)
        );

        queryClient.invalidateQueries({
          queryKey: queryKeys.tags.stats(),
          refetchType: 'none',
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
      invalidateStatsQueries(queryClient, 'diamond');
    },
    onError: error => {
      handleMutationError(error, 'delete project');
    },
  });
};
