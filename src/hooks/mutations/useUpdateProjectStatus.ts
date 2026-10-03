import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getErrorMessage } from '@/services/errors';
import { projectsService } from '@/services/pocketbase/projects.service';
import { ProjectDTO } from '@/services/types';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { createLogger } from '@/utils/logger';

import type { ChangeProjectStatusInput } from './projectCommands';
import { invalidateStatsQueries } from './statsInvalidation';

const logger = createLogger('useUpdateProjectStatus');

interface MutationContext {
  previousProject?: unknown;
}

export const useUpdateProjectStatus = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<ProjectDTO, Error, ChangeProjectStatusInput, MutationContext>({
    mutationFn: async ({
      projectId,
      nextStatus,
    }: ChangeProjectStatusInput): Promise<ProjectDTO> => {
      logger.debug('Updating project status', { projectId, nextStatus });
      return projectsService.update(projectId, { status: nextStatus });
    },
    onMutate: async ({ projectId, nextStatus }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      await queryClient.cancelQueries({
        queryKey: queryKeys.projects.detail(projectId),
      });

      const previousProject = queryClient.getQueryData(queryKeys.projects.detail(projectId));

      if (previousProject) {
        queryClient.setQueryData(queryKeys.projects.detail(projectId), {
          ...(previousProject as Record<string, unknown>),
          status: nextStatus,
        });
      }

      return { previousProject };
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });

      invalidateStatsQueries(queryClient, 'diamond');
    },
    onError: (error, variables, context) => {
      if (context?.previousProject) {
        queryClient.setQueryData(
          queryKeys.projects.detail(variables.projectId),
          context.previousProject
        );
      }

      logger.error('Project status update failed', {
        projectId: variables.projectId,
        nextStatus: variables.nextStatus,
        error: getErrorMessage(error),
      });
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.detail(variables.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.lists(),
      });
    },
    retry: false,
  });
};
