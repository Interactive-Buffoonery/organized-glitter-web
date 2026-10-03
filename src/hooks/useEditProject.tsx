/**
 * @fileoverview React Query-based project editing hook with proper authentication dependencies
 *
 * This hook provides complete project editing functionality using React Query patterns:
 * - Proper authentication state dependencies to prevent race conditions
 * - Consistent data fetching with useProjectDetailQuery
 * - Form state management with dirty tracking
 * - Field name mapping (camelCase ↔ snake_case)
 * - File upload handling
 * - Tag synchronization
 * - Navigation protection
 * - CRUD operations with confirmations
 *
 * @author @serabi
 * @since 2.0.0 - Migrated to React Query patterns to fix 404 authentication race conditions
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProjectType, ProjectFormValues } from '@/types/project';
import { useAuth } from '@/hooks/useAuth';
import { useDirtyFormGuard } from '@/hooks/useDirtyFormGuard';
import { sessionDraftKeys } from '@/services/auth/sessionDraftKeys';
import { useSessionDraft } from '@/hooks/useSessionDraft';
import { useConfirmationDialog } from '@/hooks/useConfirmationDialog';
import { useNavigateToProject } from '@/hooks/useNavigateToProject';
import { useProjectDetailQuery } from '@/hooks/queries/useProjectDetailQuery';
import {
  useArchiveProjectMutation,
  useDeleteProjectMutation,
} from '@/hooks/mutations/useProjectDetailMutations';
import { useProjectUpdateUnified } from '@/hooks/mutations/useProjectUpdateUnified';
import { useMetadata } from '@/contexts/MetadataContext';
import { notifyError, notifySuccess } from '@/lib/notifications';
import { createLogger } from '@/utils/logger';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { toUpdateProjectInput } from '@/hooks/mutations/projectCommands';
import {
  getProjectSaveErrorMessage,
  isUncertainProjectSaveError,
} from '@/utils/project/projectSaveError';
import { hasErrorStatus, isImageMimeRejection, normalizeError } from '@/services/errors';
import {
  mapProjectServerFieldErrors,
  validateProjectFormValues,
  type ProjectFormFieldErrors,
} from '@/schemas/project.schema';
import type { IncompatibleImageDetails } from '@/components/projects/IncompatibleImageDialog';
import { useRecoverableDraft } from '@/hooks/drafts/useRecoverableDraft';
import {
  isProjectDraftValues,
  projectDraftValues,
  restoreProjectDraft,
} from '@/hooks/drafts/formDraftAdapters';

type EditProjectSessionDraft = {
  formData: ProjectFormValues;
  statusBeforeDateChange: ProjectFormValues['status'] | null;
  missingPhoto: boolean;
  baselineRevision?: number;
};

const logger = createLogger('useEditProject');

const clearChangedFieldErrors = (
  errors: ProjectFormFieldErrors,
  previous: ProjectFormValues,
  next: ProjectFormValues
): ProjectFormFieldErrors => {
  const nextErrors = { ...errors };

  for (const field of Object.keys(nextErrors) as Array<keyof ProjectFormValues>) {
    const previousValue = previous[field];
    const nextValue = next[field];
    const changed =
      Array.isArray(previousValue) || Array.isArray(nextValue)
        ? JSON.stringify(previousValue) !== JSON.stringify(nextValue)
        : previousValue !== nextValue;

    if (changed) {
      delete nextErrors[field];
    }
  }

  return nextErrors;
};

/**
 * Prepare initial form data from project
 *
 * @param project - Project data from useProjectDetailQuery
 * @returns Form data prepared for editing
 */
const prepareFormInitialData = (project: ProjectType): ProjectFormValues => {
  return {
    title: project.title || '',
    userId: project.userId,
    company: project.company || '',
    artist: project.artist || '',
    status: project.status || 'wishlist',
    kitCategory: project.kitCategory || undefined,
    drillShape: project.drillShape || undefined,
    drillType: project.drillType,
    canvasType: project.canvasType,
    datePurchased: project.datePurchased || '',
    dateStarted: project.dateStarted || '',
    dateCompleted: project.dateCompleted || '',
    dateReceived: project.dateReceived || '',
    width: project.width?.toString() || '',
    height: project.height?.toString() || '',
    totalDiamonds: project.totalDiamonds || undefined,
    colorCount: project.colorCount || undefined,
    generalNotes: project.generalNotes || '',
    sourceUrl: project.sourceUrl || '',
    imageUrl: project.imageUrl,
    tags: project.tags || [],
    tagNames: project.tagNames,
    tagIds: project.tags?.map(tag => tag.id),
  };
};

const PROJECT_FORM_FIELDS = {
  id: true,
  title: true,
  userId: true,
  company: true,
  artist: true,
  status: true,
  kitCategory: true,
  drillShape: true,
  drillType: true,
  canvasType: true,
  datePurchased: true,
  dateStarted: true,
  dateCompleted: true,
  dateReceived: true,
  width: true,
  height: true,
  totalDiamonds: true,
  colorCount: true,
  generalNotes: true,
  sourceUrl: true,
  imageUrl: true,
  imageFile: true,
  imageRemoved: true,
  tags: true,
  tagNames: true,
  tagIds: true,
} satisfies Record<keyof ProjectFormValues, true>;

const PROJECT_FORM_FIELD_KEYS = Object.keys(PROJECT_FORM_FIELDS) as Array<keyof ProjectFormValues>;

const areTagsEqual = (
  left: ProjectFormValues['tags'] = [],
  right: ProjectFormValues['tags'] = []
) => {
  return (
    left.length === right.length &&
    left.every((tag, index) => {
      const rightTag = right[index];
      return rightTag && tag.id === rightTag.id && tag.name === rightTag.name;
    })
  );
};

const areStringArraysEqual = (left: string[] = [], right: string[] = []) => {
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

const hasProjectFormChanges = (current: ProjectFormValues, initial: ProjectFormValues) => {
  return PROJECT_FORM_FIELD_KEYS.some(field => {
    if (field === 'tags') {
      return !areTagsEqual(current.tags, initial.tags);
    }
    if (field === 'tagNames' || field === 'tagIds') {
      return !areStringArraysEqual(current[field], initial[field]);
    }
    return current[field] !== initial[field];
  });
};

interface UseEditProjectOptions {
  /**
   * When `true` (default), a successful save navigates to the project detail page.
   * When `false`, `handleSubmit` resolves to a boolean (success) and skips navigation,
   * so a caller (e.g. the edit drawer) can close itself and refresh in place.
   */
  navigateOnSubmit?: boolean;
}

/**
 * Enhanced project editing hook using React Query patterns
 *
 * @param projectId - ID of the project to edit
 * @param options - Optional behavior flags (e.g. `navigateOnSubmit`)
 * @returns Complete editing state and handlers
 */
export const useEditProject = (
  projectId: string | undefined,
  options: UseEditProjectOptions = {}
) => {
  const { navigateOnSubmit = true } = options;
  // Authentication state
  const { user, isAuthenticated, initialCheckComplete, isLoading: authLoading } = useAuth();
  const draftKey = projectId
    ? sessionDraftKeys.projectEdit(projectId, navigateOnSubmit ? 'page' : 'drawer')
    : null;

  // User timezone for date conversion
  const userTimezone = useUserTimezone();

  // Data fetching
  const {
    data: fetchedProject,
    isLoading: projectLoading,
    error: projectError,
    refetch: refetchProject,
  } = useProjectDetailQuery(projectId, isAuthenticated, initialCheckComplete, userTimezone);
  const project = fetchedProject?.userId === user?.id ? fetchedProject : null;

  // Mutations for project operations
  const updateProjectMutation = useProjectUpdateUnified();
  const deleteProjectMutation = useDeleteProjectMutation();
  const archiveProjectMutation = useArchiveProjectMutation();

  // Metadata for dropdowns
  const { companies, artists } = useMetadata();

  // Form state
  const restoredSessionDraft = useSessionDraft<EditProjectSessionDraft>(
    draftKey,
    user?.id,
    (): EditProjectSessionDraft | undefined =>
      formData && (!initialFormData || isDirty)
        ? {
            formData,
            statusBeforeDateChange,
            missingPhoto,
            baselineRevision:
              acceptedRevision ??
              (restoredBaselineRevision && restoredBaselineRevision.projectId === projectId
                ? restoredBaselineRevision.revision
                : initial && initial.id === projectId
                  ? initial.revision
                  : undefined),
          }
        : undefined,
    draft => {
      restoredSessionDraftRef.current = draft;
      setRestoredBaselineRevision(
        typeof draft.baselineRevision === 'number' && projectId
          ? { projectId, revision: draft.baselineRevision }
          : null
      );
      setFormData(draft.formData);
      setStatusBeforeDateChange(draft.statusBeforeDateChange ?? null);
      setMissingPhoto(draft.missingPhoto ?? false);
    }
  );
  const restoredSessionDraftRef = useRef(restoredSessionDraft);
  const [restoredBaselineRevision, setRestoredBaselineRevision] = useState<{
    projectId: string;
    revision: number;
  } | null>(() =>
    typeof restoredSessionDraft?.baselineRevision === 'number' && projectId
      ? { projectId, revision: restoredSessionDraft.baselineRevision }
      : null
  );
  const [formData, setFormData] = useState<ProjectFormValues | null>(
    () => restoredSessionDraft?.formData ?? null
  );
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [acceptedRevision, setAcceptedRevision] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ProjectFormFieldErrors>({});
  const [imageCompatError, setImageCompatError] = useState<IncompatibleImageDetails | null>(null);
  const [missingPhoto, setMissingPhoto] = useState(restoredSessionDraft?.missingPhoto ?? false);
  const [statusBeforeDateChange, setStatusBeforeDateChange] = useState<
    ProjectFormValues['status'] | null
  >(restoredSessionDraft?.statusBeforeDateChange ?? null);

  // Navigation state with a stable form comparison instead of JSON stringification
  const [initial, setInitial] = useState<{
    id: string;
    data: ProjectFormValues;
    updatedAt: string;
    revision: number;
  } | null>(null);
  useEffect(() => {
    if (project && (initial?.id !== project.id || initial.data.userId !== project.userId)) {
      setInitial({
        id: project.id,
        data: prepareFormInitialData(project),
        updatedAt: project.updatedAt,
        revision: project.revision ?? 0,
      });
      setConflict(
        restoredBaselineRevision?.projectId === project.id &&
          restoredBaselineRevision.revision !== (project.revision ?? 0)
      );
      setAcceptedRevision(null);
      if (
        initial ||
        (formData?.userId !== project.userId &&
          restoredSessionDraftRef.current?.formData.userId !== project.userId) ||
        projectId !== project.id
      ) {
        setFormData(null);
        setStatusBeforeDateChange(null);
      }
    }
  }, [project, projectId, initial, formData?.userId, restoredBaselineRevision]);
  const initialFormData =
    initial && initial.id === projectId && initial.data.userId === user?.id ? initial.data : null;
  const draft = useRecoverableDraft({
    kind: 'project-edit',
    ownerAccountId: initialFormData?.userId,
    recordId: projectId,
    baseline: initialFormData ? projectDraftValues(initialFormData) : null,
    values: formData
      ? projectDraftValues(formData, missingPhoto, undefined, statusBeforeDateChange)
      : null,
    baselineUpdatedAt: initial?.updatedAt,
    validate: isProjectDraftValues,
    onRestore: saved => {
      if (!initialFormData) return;
      setFormData(restoreProjectDraft(initialFormData, saved, user?.id ?? ''));
      setMissingPhoto(saved.hadNewPhoto);
      setStatusBeforeDateChange(saved.statusBeforeDateChange ?? null);
    },
  });
  const photoChoicePending = missingPhoto && !formData?.imageFile && !formData?.imageRemoved;
  const isDirty = Boolean(
    (formData && initialFormData && hasProjectFormChanges(formData, initialFormData)) || draft.dirty
  );
  const { ConfirmationDialog, confirmDelete, confirmArchive } = useConfirmationDialog();
  const { allowLeave, confirmDiscard, markChanged } = useDirtyFormGuard({
    isDirty,
    isSaving: submitting,
    onDiscard: draft.discardOnConfirmedLeave,
  });
  const navigateToProject = useNavigateToProject();
  const navigate = useNavigate();

  // Combined loading state
  const loading = authLoading || projectLoading;

  // Prepare companies and artists arrays
  const companiesList = useMemo(() => {
    return Array.isArray(companies) ? companies.map(c => c.name) : [];
  }, [companies]);

  const artistsList = useMemo(() => {
    return Array.isArray(artists) ? artists.map(a => a.name) : [];
  }, [artists]);

  // Initialize form data when project loads
  useEffect(() => {
    if (initialFormData && !formData) {
      setFormData(initialFormData);
      logger.debug('Form data initialized from project', { projectId: project?.id });
    }
  }, [initialFormData, project?.id, formData]);

  // Form data change handler (full data)
  const handleFormDataChange = useCallback(
    (data: ProjectFormValues) => {
      markChanged();
      if (data.imageFile || data.imageRemoved) setMissingPhoto(false);
      if (formData) {
        setFieldErrors(errors => clearChangedFieldErrors(errors, formData, data));
      }

      setFormData(prev => {
        if (prev && !hasProjectFormChanges(prev, data)) {
          return prev;
        }
        return data;
      });
    },
    [formData, markChanged]
  );

  const useLatestRevision = useCallback(async () => {
    const latest = await refetchProject();
    if (
      latest.isError ||
      !latest.data ||
      latest.data.id !== projectId ||
      latest.data.userId !== user?.id
    ) {
      notifyError('Could not load latest project', 'Your edits are still here. Try again.');
      return false;
    }
    setAcceptedRevision(latest.data.revision ?? 0);
    setConflict(false);
    return true;
  }, [projectId, refetchProject, user?.id]);

  // Submit handler with unified mutation
  const handleSubmit = useCallback(
    async (data: ProjectFormValues) => {
      if (draft.pending || photoChoicePending) return false;
      if (!project || !data) {
        logger.error('🚫 Missing project or form data for submit', {
          hasProject: !!project,
          hasData: !!data,
        });
        return false;
      }

      const validation = validateProjectFormValues(data, data.userId || project.userId);
      setFieldErrors(validation.fieldErrors);
      if (!validation.isValid) {
        const firstError = Object.values(validation.fieldErrors)[0];
        notifyError(
          'Could not save project',
          firstError ?? 'Please review the highlighted fields and try again.'
        );
        return false;
      }

      try {
        setSubmitting(true);
        logger.debug('🚀 Starting project update', {
          projectId: project.id,
          hasImageFile: !!data.imageFile,
          mutationState: updateProjectMutation.status,
        });

        // Use unified mutation with proper typing
        const formWithFile = toUpdateProjectInput(project.id, data);
        const selectedTagIds = (data.tags ?? []).map(tag => tag.id);
        const openingTagIds = (initial?.data.tags ?? []).map(tag => tag.id);
        if (
          selectedTagIds.length !== openingTagIds.length ||
          selectedTagIds.some(tagId => !openingTagIds.includes(tagId))
        ) {
          formWithFile.tagIds = selectedTagIds;
        }
        logger.debug('🔄 Calling mutation with data', {
          projectId: project.id,
          formDataKeys: Object.keys(formWithFile),
          hasImageFile: !!formWithFile.imageFile,
        });

        const result = await updateProjectMutation.mutateAsync({
          ...formWithFile,
          expectedRevision:
            acceptedRevision ??
            (restoredBaselineRevision?.projectId === project.id
              ? restoredBaselineRevision.revision
              : initial?.revision) ??
            0,
          onConfirmedSave: () => {
            draft.saved();
            allowLeave();
          },
        });
        logger.info('✅ Mutation completed successfully', {
          projectId: project.id,
          resultId: result?.id,
        });

        if (!navigateOnSubmit) {
          return true;
        }

        // Navigate back to project detail
        logger.debug('🧭 Attempting navigation to project detail', {
          projectId: project.id,
        });

        const navigationResult = navigateToProject(project.id);
        logger.debug('🧭 Navigation result', {
          projectId: project.id,
          success: navigationResult.success,
          error: navigationResult.error,
        });

        if (!navigationResult.success) {
          logger.error('🚫 Navigation failed after successful mutation', {
            projectId: project.id,
            navigationError: navigationResult.error,
          });
        } else {
          logger.info('✅ Navigation completed successfully', {
            projectId: project.id,
          });
        }

        return true;
      } catch (error) {
        if (hasErrorStatus(error, 409)) {
          setConflict(true);
          return false;
        }
        logger.error('❌ Error updating project', {
          error: error instanceof Error ? error.message : error,
          projectId: project.id,
          mutationState: updateProjectMutation.status,
        });

        const mimeRejection = isImageMimeRejection(error);
        if (mimeRejection && data.imageFile) {
          setImageCompatError({
            fileName: data.imageFile.name,
            fileType: data.imageFile.type,
            fileSize: data.imageFile.size,
            serverMessage: mimeRejection.message,
          });
        }

        const normalized = normalizeError(error, 'Project update');
        const serverFieldErrors = mapProjectServerFieldErrors(normalized.fieldErrors);
        if (Object.keys(serverFieldErrors).length > 0) {
          setFieldErrors(serverFieldErrors);
        }
        if (Object.keys(serverFieldErrors).length === 0 && !(mimeRejection && data.imageFile)) {
          notifyError(
            isUncertainProjectSaveError(error) ? 'Save not confirmed' : 'Project not saved',
            getProjectSaveErrorMessage(error)
          );
        }
        return false;
      } finally {
        setSubmitting(false);
        logger.debug('🏁 Submit handler completed', {
          projectId: project.id,
        });
      }
    },
    [
      project,
      updateProjectMutation,
      navigateToProject,
      navigateOnSubmit,
      draft,
      photoChoicePending,
      acceptedRevision,
      restoredBaselineRevision,
      initial?.revision,
      initial?.data.tags,
      allowLeave,
    ]
  );

  // Archive handler
  const handleArchive = useCallback(async () => {
    if (!project) return;

    const confirmed = await confirmArchive(
      'Archive Project',
      'Are you sure you want to archive this project?'
    );

    if (confirmed) {
      try {
        await archiveProjectMutation.mutateAsync({ projectId: project.id });
        draft.saved();
        allowLeave();
        notifySuccess('Project archived', 'Project archived successfully');
        navigate('/dashboard', { replace: true });
      } catch (error) {
        logger.error('Error archiving project', { error, projectId: project.id });
        notifyError('Archive failed', 'Failed to archive project');
      }
    }
  }, [project, archiveProjectMutation, confirmArchive, navigate, draft, allowLeave]);

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!project) return;

    const confirmed = await confirmDelete(
      'Are you sure you want to delete this project? This action cannot be undone.'
    );

    if (confirmed) {
      try {
        await deleteProjectMutation.mutateAsync({ projectId: project.id, title: project.title });
        draft.saved();
        allowLeave();
        notifySuccess('Project deleted', 'Project deleted successfully');
        navigate('/dashboard', { replace: true });
      } catch (error) {
        logger.error('Error deleting project', { error, projectId: project.id });
        notifyError('Delete failed', 'Failed to delete project');
      }
    }
  }, [project, deleteProjectMutation, confirmDelete, navigate, draft, allowLeave]);

  return {
    // Data
    project,
    loading,
    submitting,
    companies: companiesList,
    artists: artistsList,
    formData: initialFormData ? formData : null,
    fieldErrors,
    conflict,
    draft,
    photoChoicePending,
    statusBeforeDateChange,
    setStatusBeforeDateChange,
    continueWithoutPhoto: () => setMissingPhoto(false),

    // State
    imageCompatError,

    // Handlers
    handleFormDataChange,
    handleSubmit,
    useLatestRevision,
    handleArchive,
    handleDelete,
    confirmDiscard,
    clearImageCompatError: () => setImageCompatError(null),
    refetchProject,

    // Components
    ConfirmationDialog,

    // Error state
    error: projectError,
  };
};
