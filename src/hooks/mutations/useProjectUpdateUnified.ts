import { useMutation, useQueryClient } from '@tanstack/react-query';

import { normalizeError } from '@/services/errors';
import { projectsService } from '@/services/pocketbase/projects.service';
import { ProjectDTO } from '@/services/types';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { createLogger } from '@/utils/logger';
import { logFormData, validateFormDataForUpdate } from '@/utils/project/formdata-builder';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';

import { buildUpdateProjectFormData } from './projectMutationAdapters';
import type { UpdateProjectInput } from './projectCommands';
import { invalidateStatsQueries } from './statsInvalidation';

const logger = createLogger('useProjectUpdateUnified');

type UpdateProjectMutationInput = UpdateProjectInput & { onConfirmedSave?: () => void };

export const useProjectUpdateUnified = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userTimezone = useUserTimezone();

  return useMutation({
    mutationFn: async (input: UpdateProjectMutationInput): Promise<ProjectDTO> => {
      if (!user?.id) {
        throw Object.assign(new Error('User not authenticated'), {
          type: 'auth' as const,
          retryable: false,
        });
      }

      const formData = await buildUpdateProjectFormData(input, user.id, userTimezone);
      const validation = validateFormDataForUpdate(formData, ['title']);

      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      logFormData(formData, `Project Update: ${input.projectId}`);
      const project = await projectsService.update(
        input.projectId,
        formData,
        input.expectedRevision
      );
      try {
        input.onConfirmedSave?.();
      } catch (error) {
        logger.error('Local draft cleanup failed after project update', error);
      }
      return project;
    },
    onMutate: async input => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.projects.detail(input.projectId),
      });

      const previousProject = queryClient.getQueryData(queryKeys.projects.detail(input.projectId));

      if (previousProject) {
        const optimisticPatch = {
          title: input.title,
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.generalNotes !== undefined ? { generalNotes: input.generalNotes ?? '' } : {}),
          ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl ?? '' } : {}),
          ...(input.datePurchased !== undefined
            ? { datePurchased: input.datePurchased ?? undefined }
            : {}),
          ...(input.dateStarted !== undefined
            ? { dateStarted: input.dateStarted ?? undefined }
            : {}),
          ...(input.dateCompleted !== undefined
            ? { dateCompleted: input.dateCompleted ?? undefined }
            : {}),
          ...(input.dateReceived !== undefined
            ? { dateReceived: input.dateReceived ?? undefined }
            : {}),
          ...(input.drillShape !== undefined
            ? { drillShape: input.drillShape === null ? '' : input.drillShape }
            : {}),
          ...(input.kitCategory !== undefined ? { kitCategory: input.kitCategory } : {}),
          ...(input.width !== undefined ? { width: input.width ?? undefined } : {}),
          ...(input.height !== undefined ? { height: input.height ?? undefined } : {}),
          ...(input.totalDiamonds !== undefined
            ? { totalDiamonds: input.totalDiamonds ?? undefined }
            : {}),
          ...(input.colorCount !== undefined ? { colorCount: input.colorCount ?? undefined } : {}),
          ...(input.companyName !== undefined
            ? { company: input.companyName === null ? '' : input.companyName }
            : {}),
          ...(input.artistName !== undefined
            ? { artist: input.artistName === null ? '' : input.artistName }
            : {}),
        };

        queryClient.setQueryData(queryKeys.projects.detail(input.projectId), {
          ...(previousProject as Record<string, unknown>),
          ...optimisticPatch,
        });
      }

      return {
        previousProject,
        projectId: input.projectId,
      };
    },
    onSuccess: (data, _input, context) => {
      const projectId = context?.projectId || data.id;

      try {
        capture(AnalyticsEvent.PROJECT_UPDATED, {
          surface: 'edit_project',
          status: data.status,
          has_image: Boolean(data.image),
          has_notes: (data.generalNotes ?? '').trim().length > 0,
          has_source_url: (data.sourceUrl ?? '').trim().length > 0,
          has_dimensions: data.width !== undefined || data.height !== undefined,
        });
      } catch (error) {
        logger.error('Project update analytics failed after save', error);
      }

      try {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
        invalidateStatsQueries(queryClient, 'diamond');
      } catch (error) {
        logger.error('Project cache refresh failed after save', error);
      }
    },
    onError: (error, _input, context) => {
      if (context?.previousProject && context.projectId) {
        queryClient.setQueryData(
          queryKeys.projects.detail(context.projectId),
          context.previousProject
        );
      }

      const normalized = normalizeError(error, 'Project update');
      logger.error('Project update failed', {
        projectId: context?.projectId,
        type: normalized.type,
        status: normalized.status,
        message: normalized.message,
        fieldErrors: normalized.fieldErrors,
      });
    },
    onSettled: (_data, _error, input) => {
      try {
        queryClient.invalidateQueries({
          queryKey: queryKeys.projects.detail(input.projectId),
        });
      } catch (error) {
        logger.error('Project detail refresh failed after update', error);
      }
    },
    retry: false,
  });
};
