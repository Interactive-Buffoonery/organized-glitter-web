import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { notify } from '@/lib/notifications';
import { handleMutationError } from '@/hooks/mutations/handleMutationError';
import { patchProjectDetail } from '@/hooks/mutations/projectCache';
import { projectsService } from '@/services/pocketbase/projects.service';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import type { ProjectDTO } from '@/services/types';
import { invalidateStatsQueries } from './statsInvalidation';

interface ProjectFieldUpdateBuildContext {
  userId: string;
  userTimezone: string;
}

interface ProjectFieldUpdateInvalidateContext {
  userId: string | undefined;
}

interface ProjectFieldUpdateBaseConfig<TInput extends { projectId: string }> {
  /**
   * Short label used in error toasts ("update project <label> failed") and
   * in logs. e.g. 'overview', 'dates', 'image'.
   */
  label: string;

  /** Validate input that does not depend on the saved project before any read. */
  validateInput?: (input: TInput, ctx: ProjectFieldUpdateBuildContext) => void | Promise<void>;

  /**
   * Build the FormData payload sent to projectsService.update. The seam
   * always uses FormData so that the multipart contract (image, file
   * removal, date-clear sentinels) lives in one place even for fields that
   * could in theory use a JSON object.
   */
  /**
   * Compute the optimistic patch to apply to the cached project detail.
   * Return undefined to skip the optimistic patch, used by image upload,
   * where the server-assigned URL isn't known until the response arrives.
   */
  optimisticPatch?: (input: TInput) => Partial<Record<string, unknown>> | undefined;

  serverPatch?: (data: ProjectDTO) => Partial<Record<string, unknown>>;

  /**
   * Extra query keys to invalidate on success, beyond the standard
   * detail/lists invalidation. e.g. overview invalidates stats.overview
   * because status changes affect dashboard counts.
   */
  extraInvalidations?: (input: TInput, ctx: ProjectFieldUpdateInvalidateContext) => QueryKey[];

  /** The affected Stats projections; defaults to all diamond projections. */
  statsInvalidation?: 'diamond' | 'overview';

  /** Toast on success. Default: silent (mutations are silent unless they aren't). */
  successNotify?: { title: string; description: string };
}

export type ProjectFieldUpdateConfig<TInput extends { projectId: string }> =
  ProjectFieldUpdateBaseConfig<TInput> &
    (
      | {
          buildFormData: (input: TInput, ctx: ProjectFieldUpdateBuildContext) => Promise<FormData>;
          buildFormDataFromCurrent?: never;
          currentFields?: never;
        }
      | {
          buildFormDataFromCurrent: (
            input: TInput,
            ctx: ProjectFieldUpdateBuildContext,
            current: ProjectDTO
          ) => Promise<FormData>;
          currentFields: string[];
          buildFormData?: never;
        }
    );

interface MutationContext {
  previousProject?: unknown;
}

/**
 * Shared recipe for partial updates to a single Project. Owns the
 * optimistic-patch / rollback / invalidation lifecycle so individual section
 * mutations can be expressed as a config + a payload builder.
 *
 * Tags are NOT a Project field update, they're a join-table sync, and
 * intentionally don't use this seam.
 */
export const useProjectFieldUpdateMutation = <TInput extends { projectId: string }>(
  config: ProjectFieldUpdateConfig<TInput>
) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userTimezone = useUserTimezone();

  return useMutation({
    mutationFn: async (input: TInput) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }
      const context = {
        userId: user.id,
        userTimezone,
      };
      await config.validateInput?.(input, context);
      const buildFromCurrent = config.buildFormDataFromCurrent;
      if (buildFromCurrent) {
        return projectsService.updateWithCurrent(input.projectId, config.currentFields, current =>
          buildFromCurrent(input, context, current)
        );
      }
      const formData = await config.buildFormData(input, context);
      return projectsService.update(input.projectId, formData);
    },

    onMutate: async (input: TInput): Promise<MutationContext> => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.projects.detail(input.projectId),
      });

      const previousProject = queryClient.getQueryData(queryKeys.projects.detail(input.projectId));
      const patch = config.optimisticPatch?.(input);

      if (previousProject && patch) {
        queryClient.setQueryData(
          queryKeys.projects.detail(input.projectId),
          patchProjectDetail(previousProject, patch)
        );
      }

      return { previousProject };
    },

    onSuccess: (data, input) => {
      const patch = config.serverPatch?.(data);
      if (patch) {
        queryClient.setQueryData(queryKeys.projects.detail(input.projectId), cached =>
          patchProjectDetail(cached, patch)
        );
      }

      capture(AnalyticsEvent.PROJECT_UPDATED, {
        surface: 'project_detail',
        section: config.label,
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
      invalidateStatsQueries(queryClient, config.statsInvalidation ?? 'diamond');

      const extraKeys = config.extraInvalidations?.(input, { userId: user?.id }) ?? [];
      for (const key of extraKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }

      if (config.successNotify) {
        notify({ kind: 'success', ...config.successNotify });
      }
    },

    onError: (error, input, context) => {
      if (context?.previousProject) {
        queryClient.setQueryData(
          queryKeys.projects.detail(input.projectId),
          context.previousProject
        );
      }
      handleMutationError(error, `update project ${config.label}`);
    },

    onSettled: (_data, _error, input) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.detail(input.projectId),
        exact: true,
      });
    },
  });
};
