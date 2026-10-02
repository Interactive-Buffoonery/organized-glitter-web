/**
 * Project creation mutation with optional post-success redirect handling.
 * By default it behaves as a core mutation with no navigation; project lists
 * and Stats still become stale after the write.
 * Pass `{ redirect: true }` for the standard create-and-open-detail flow.
 */
import { notify } from '@/lib/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { normalizeError, isValidationError } from '@/services/errors';
import { TagService } from '@/services/pocketbase/tags.service';
import { projectsService } from '@/services/pocketbase/projects.service';
import { ProjectDTO } from '@/services/types';
import { createLogger } from '@/utils/logger';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import { trackGrowthFunnelMilestone } from '@/services/growth-funnel-analytics';
import { useAuth } from '@/hooks/useAuth';
import { useNavigateToProject } from '@/hooks/useNavigateToProject';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { invalidateStatsQueries } from './statsInvalidation';
import {
  ensureCurrentSessionAfterCreate,
  isSessionChangedError,
  recordCompletedSessionCreate,
} from '@/services/auth/sessionRecovery';
import { getAuthToken } from '@/services/auth';

import {
  getProjectSaveErrorMessage,
  isUncertainProjectSaveError,
  ProjectRelationLookupError,
} from '@/utils/project/projectSaveError';

import { buildCreateProjectFormData } from './projectMutationAdapters';
import type { CreateProjectInput } from './projectCommands';
import { runPostWriteEffect } from './runPostWriteEffect';

const logger = createLogger('useCreateProject');

const POST_SUCCESS_TOAST_SETTLE_MS = 250;
const POST_NAV_INVALIDATE_DELAY_MS = 500;
const FALLBACK_HARD_REDIRECT_MS = 1000;

interface ProjectCreationResult {
  project: ProjectDTO;
  failedTagIds: string[];
}

const addTagsToProject = async (projectId: string, tagIds: string[]) => {
  const results = await Promise.allSettled(
    tagIds.map(tagId => TagService.addTagToProject(projectId, tagId))
  );

  const failedTagIds: string[] = [];
  results.forEach((result, i) => {
    const tagId = tagIds[i];
    if (result.status === 'rejected') {
      if (isSessionChangedError(result.reason)) throw result.reason;
      logger.error('Error linking tag to project', { projectId, tagId, error: result.reason });
      failedTagIds.push(tagId);
    } else if (result.value.status === 'error') {
      if (isSessionChangedError(result.value.error)) throw result.value.error;
      failedTagIds.push(tagId);
    }
  });

  return failedTagIds;
};

const createProject = async (
  input: CreateProjectInput,
  onConfirmedSave?: () => void
): Promise<ProjectCreationResult> => {
  const createToken = getAuthToken() ?? '';
  const formData = await buildCreateProjectFormData(input);
  const project = await projectsService.create(formData);
  try {
    onConfirmedSave?.();
  } catch (error) {
    logger.error('Local draft cleanup failed after project creation', error);
  }
  let failedTagIds: string[] = [];

  try {
    ensureCurrentSessionAfterCreate(createToken, 'projects', project.id);
    if (input.tagIds?.length) {
      failedTagIds = await addTagsToProject(project.id, input.tagIds);

      if (failedTagIds.length > 0) {
        logger.warn('Some tags failed to link after project creation', {
          projectId: project.id,
          failedTagCount: failedTagIds.length,
          requestedTagCount: input.tagIds.length,
        });
      }
    }
    ensureCurrentSessionAfterCreate(createToken, 'projects', project.id);
  } catch (error) {
    if (isSessionChangedError(error))
      recordCompletedSessionCreate(createToken, 'projects', project.id);
    throw error;
  }

  return { project, failedTagIds };
};

interface UseCreateProjectOptions {
  redirect?: boolean;
  onConfirmedSave?: () => void;
}

export const useCreateProject = ({
  redirect = false,
  onConfirmedSave,
}: UseCreateProjectOptions = {}) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigateToProject = useNavigateToProject();

  return useMutation<ProjectCreationResult, Error, CreateProjectInput>({
    mutationFn: input => createProject(input, onConfirmedSave),
    onSuccess: async ({ project: data, failedTagIds }) => {
      runPostWriteEffect(logger, 'Project Stats refresh failed after creation', () => {
        invalidateStatsQueries(queryClient, 'diamond');
      });
      runPostWriteEffect(logger, 'Project growth analytics failed after creation', () => {
        trackGrowthFunnelMilestone({
          userId: user?.id,
          event: AnalyticsEvent.FIRST_PROJECT_CREATED,
          properties: {
            craft: 'diamond',
            entity_type: 'project',
            source_surface: redirect ? 'new_project' : 'project_create_mutation',
            has_cover_image: Boolean(data.image),
          },
          activationSignal: 'item_created',
        });
      });

      if (!redirect) {
        void queryClient
          .invalidateQueries({ queryKey: queryKeys.projects.lists(), refetchType: 'none' })
          .catch(error => logger.warn('Could not mark project lists stale after creation', error));
        return;
      }

      runPostWriteEffect(logger, 'Project create analytics failed after creation', () => {
        capture(AnalyticsEvent.PROJECT_CREATED);
      });

      try {
        if (failedTagIds.length > 0) {
          notify({
            kind: 'warning',
            title: "Project created, but some tags didn't save",
            description: `Open "${data.title}" to retry your tags.`,
          });
        } else {
          notify({
            kind: 'success',
            title: 'Project created',
            description: `"${data.title}" has been added to your collection.`,
          });
        }

        await new Promise(resolve => setTimeout(resolve, POST_SUCCESS_TOAST_SETTLE_MS));

        const navigationResult = navigateToProject(data.id, {
          projectData: data,
          replace: true,
          showLoadingFeedback: false,
        });

        if (!navigationResult.success) {
          logger.error('Project navigation failed after creation', {
            projectId: data.id,
            error: navigationResult.error,
          });

          notify({
            kind: 'info',
            title: 'Navigation Warning',
            description: `Project "${data.title}" was created but navigation failed. Please check your project list.`,
          });

          setTimeout(() => {
            window.location.href = `/projects/${data.id}`;
          }, FALLBACK_HARD_REDIRECT_MS);
        }

        setTimeout(() => {
          const invalidations = [
            queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() }),
            queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(data.id) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.tags.stats() }),
          ];

          void Promise.allSettled(invalidations).then(results => {
            results.forEach((result, index) => {
              if (result.status === 'rejected') {
                logger.error('Post-create cache invalidation failed', {
                  projectId: data.id,
                  index,
                  error: result.reason,
                });
              }
            });
          });
        }, POST_NAV_INVALIDATE_DELAY_MS);
      } catch (successHandlerError) {
        logger.error('Error handling post-create navigation', successHandlerError);
        notify({
          kind: 'warning',
          title: 'Post-creation tasks incomplete',
          description: 'Project was created but there was an issue with post-creation tasks.',
        });
      }
    },
    onError: (error, variables) => {
      const normalized = normalizeError(error, 'Project creation');
      logger.error('Project creation failed', {
        type: normalized.type,
        status: normalized.status,
        message: normalized.message,
        fieldErrors: normalized.fieldErrors,
      });

      if (!redirect) {
        return;
      }

      if (error instanceof ProjectRelationLookupError) {
        notify({
          kind: 'error',
          title: 'Project not saved',
          description: getProjectSaveErrorMessage(error),
        });
        return;
      }

      if (isValidationError(error)) {
        notify({
          kind: 'error',
          title: 'Validation Error',
          description: normalized.message || 'Please check your project information and try again.',
        });
        return;
      }

      if (isUncertainProjectSaveError(error)) {
        notify({
          kind: 'warning',
          title: 'Project creation status unknown',
          description: `We could not confirm whether "${variables.title}" was created. Check your project list before trying again.`,
        });
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isRateLimit =
        normalized.status === 429 ||
        errorMessage.includes('429') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('Too many requests');

      notify({
        kind: 'error',
        title: isRateLimit ? 'Too Many Requests' : 'Error Creating Project',
        description: isRateLimit
          ? 'Server is busy. Please wait a moment and try again.'
          : errorMessage || 'Failed to create project. Please try again.',
      });
    },
    retry: false,
  });
};
