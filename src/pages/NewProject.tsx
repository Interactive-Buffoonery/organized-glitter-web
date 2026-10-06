import { notify } from '@/lib/notifications';

/**
 * NewProject Component
 *
 * Full-featured form for creating diamond painting projects using EditProject layout
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/hooks/useAuth';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { getCurrentDateInUserTimezone } from '@/utils/date/timezoneUtils';
import { useCompletedSessionCreate } from '@/hooks/useCompletedSessionCreate';
import {
  acknowledgeCompletedSessionDestination,
  isSessionChangedError,
} from '@/services/auth/sessionRecovery';
import { useMetadata } from '@/contexts/MetadataContext';
import { useCreateProject } from '@/hooks/mutations/useCreateProject';
import { useCreateCompany, type CreateCompanyData } from '@/hooks/mutations/useCompanyMutations';
import { useCreateArtist, type CreateArtistData } from '@/hooks/mutations/useArtistMutations';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { CompaniesService } from '@/services/pocketbase/companies.service';
import { ArtistsService } from '@/services/pocketbase/artists.service';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronLeft, X } from 'lucide-react';
import { ProjectFormValues } from '@/types/project';
import ProjectFormSections from '@/components/projects/ProjectFormSections';
import { ProjectFormFooter } from '@/components/projects/form/ProjectFormFooter';
import {
  IncompatibleImageDialog,
  type IncompatibleImageDetails,
} from '@/components/projects/IncompatibleImageDialog';
import { toCreateProjectInput } from '@/hooks/mutations/projectCommands';
import { isImageMimeRejection, normalizeError } from '@/services/errors';
import {
  mapProjectServerFieldErrors,
  validateProjectFormValues,
  type ProjectFormFieldErrors,
} from '@/schemas/project.schema';

import { logger } from '@/utils/logger';
import { useAppReady } from '@/hooks/useAppReady';
import { isUncertainProjectSaveError } from '@/utils/project/projectSaveError';
import { sessionDraftKeys } from '@/services/auth/sessionDraftKeys';
import { useSessionDraft } from '@/hooks/useSessionDraft';
import {
  DraftPhotoReminder,
  DraftRecoveryPanel,
  DraftStorageError,
} from '@/components/drafts/DraftRecoveryPanel';
import { useRecoverableDraft } from '@/hooks/drafts/useRecoverableDraft';
import { useDirtyFormGuard } from '@/hooks/useDirtyFormGuard';
import {
  isProjectDraftValues,
  projectDraftValues,
  restoreProjectDraft,
} from '@/hooks/drafts/formDraftAdapters';

type NewProjectDraft = {
  formData: ProjectFormValues;
  statusBeforeDateChange: ProjectFormValues['status'] | null;
  missingPhoto: boolean;
  companies: Map<string, CreateCompanyData>;
  artists: Map<string, CreateArtistData>;
};

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

const NewProject = () => {
  useAppReady();
  const userTimezone = useUserTimezone();
  const { user, isLoading: authLoading } = useAuth();
  const completedCreateDestinations = useCompletedSessionCreate(user?.id, '/projects/');
  const restored = useSessionDraft<NewProjectDraft>(
    sessionDraftKeys.newProject,
    user?.id,
    (): NewProjectDraft => ({
      formData,
      statusBeforeDateChange,
      missingPhoto,
      companies: draftMetadata.current.companies,
      artists: draftMetadata.current.artists,
    }),
    draft => {
      restoredDraft.current = draft;
      draftMetadata.current.companies = draft.companies;
      draftMetadata.current.artists = draft.artists;
      setFormData(draft.formData);
      setStatusBeforeDateChange(draft.statusBeforeDateChange ?? null);
      setMissingPhoto(draft.missingPhoto ?? false);
    }
  );
  const restoredDraft = useRef(restored);
  const { companyNames, artistNames, isLoading } = useMetadata();
  const createCompanyMutation = useCreateCompany({ notifyOnSuccess: false });
  const createArtistMutation = useCreateArtist({ notifyOnSuccess: false });
  const queryClient = useQueryClient();
  const draftMetadata = useRef({
    companies: restoredDraft.current?.companies ?? new Map<string, CreateCompanyData>(),
    artists: restoredDraft.current?.artists ?? new Map<string, CreateArtistData>(),
  });

  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ProjectFormFieldErrors>({});
  const [imageCompatError, setImageCompatError] = useState<IncompatibleImageDetails | null>(null);

  const [initialFormData] = useState<ProjectFormValues>(() => ({
    title: '',
    userId: '',
    status: 'wishlist',
    company: '',
    artist: '',
    drillShape: 'round',
    datePurchased: undefined,
    dateReceived: undefined,
    dateStarted: undefined,
    dateCompleted: undefined,
    generalNotes: '',
    sourceUrl: '',
    totalDiamonds: undefined,
    colorCount: undefined,
    width: undefined,
    height: undefined,
    kitCategory: 'full',
    imageFile: null,
    tags: [],
  }));
  const [formData, setFormData] = useState<ProjectFormValues>(
    () => restoredDraft.current?.formData ?? initialFormData
  );
  const [missingPhoto, setMissingPhoto] = useState(restoredDraft.current?.missingPhoto ?? false);
  const [statusBeforeDateChange, setStatusBeforeDateChange] = useState<
    ProjectFormValues['status'] | null
  >(restoredDraft.current?.statusBeforeDateChange ?? null);
  const draft = useRecoverableDraft({
    kind: 'project-new',
    ownerAccountId: formData.userId,
    baseline: projectDraftValues(initialFormData, false, draftMetadata.current),
    values: projectDraftValues(
      formData,
      missingPhoto,
      draftMetadata.current,
      statusBeforeDateChange
    ),
    validate: isProjectDraftValues,
    onRestore: saved => {
      draftMetadata.current.companies = new Map(
        (saved.companies ?? []).map(item => [item.name, item])
      );
      draftMetadata.current.artists = new Map((saved.artists ?? []).map(item => [item.name, item]));
      setMissingPhoto(saved.hadNewPhoto);
      setStatusBeforeDateChange(saved.statusBeforeDateChange ?? null);
      setFormData(restoreProjectDraft(formData, saved, user?.id ?? ''));
    },
  });
  const { allowLeave, confirmDiscard, markChanged } = useDirtyFormGuard({
    isDirty: draft.dirty,
    isSaving: submitting,
    onDiscard: draft.discardOnConfirmedLeave,
  });
  const createProjectMutation = useCreateProject({
    redirect: true,
    onConfirmedSave: () => {
      draft.saved();
      allowLeave();
    },
  });
  const photoChoicePending = missingPhoto && !formData.imageFile && !formData.imageRemoved;

  // Update userId when user becomes available
  useEffect(() => {
    if (user?.id && formData.userId !== user.id) {
      if (restoredDraft.current?.formData.userId === user.id) return;
      if (formData.userId) {
        draftMetadata.current.companies.clear();
        draftMetadata.current.artists.clear();
        setMissingPhoto(false);
        setStatusBeforeDateChange(null);
      }
      setFormData({ ...initialFormData, userId: user.id });
    }
  }, [user?.id, formData.userId, initialFormData]);

  const clearError = () => setError(null);

  const handleCancel = () => {
    confirmDiscard(() => navigate('/dashboard'));
  };

  const handleFormChange = (data: ProjectFormValues) => {
    markChanged();
    if (data.imageFile || data.imageRemoved) setMissingPhoto(false);
    setFieldErrors(errors => clearChangedFieldErrors(errors, formData, data));
    setFormData(data);
  };

  const handleSubmit = async (data: ProjectFormValues) => {
    if (draft.pending || photoChoicePending) return;
    if (!user?.id) {
      notify({
        kind: 'error',
        title: 'Authentication required',
        description: 'You must be logged in to create a project',
      });
      return;
    }

    const validation = validateProjectFormValues(
      data,
      getCurrentDateInUserTimezone(userTimezone),
      user.id
    );
    setFieldErrors(validation.fieldErrors);
    if (!validation.isValid) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const createdMetadata: Array<{ kind: 'company' | 'artist'; id: string }> = [];
    const rollbackCreatedMetadata = async () => {
      const failed: string[] = [];
      for (const record of [...createdMetadata].reverse()) {
        try {
          if (record.kind === 'company') {
            await CompaniesService.delete(record.id);
          } else {
            await ArtistsService.delete(record.id);
          }
        } catch (rollbackError) {
          logger.error('Failed to roll back project metadata', {
            kind: record.kind,
            id: record.id,
            error: rollbackError,
          });
          failed.push(record.kind);
          continue;
        }

        try {
          await queryClient.invalidateQueries({
            queryKey: record.kind === 'company' ? queryKeys.companies.all : queryKeys.artists.all,
          });
        } catch (cacheError) {
          logger.error('Failed to refresh metadata after rollback', {
            kind: record.kind,
            id: record.id,
            error: cacheError,
          });
        }
      }
      return failed;
    };

    try {
      logger.debug('Starting project creation process', {
        hasImage: !!data.imageFile,
      });

      // Create metadata entities first if needed
      // Create company if needed
      if (data.company && data.company !== 'other' && !companyNames.includes(data.company)) {
        try {
          const existing = await CompaniesService.findByName(data.company, user.id);
          if (!existing) {
            const draft = draftMetadata.current.companies.get(data.company);
            const created = await createCompanyMutation.mutateAsync(
              draft?.name === data.company ? draft : { name: data.company }
            );
            createdMetadata.push({ kind: 'company', id: created.id });
          }
        } catch (error) {
          if (isSessionChangedError(error)) {
            notify({
              kind: 'warning',
              title: 'Session changed while adding company',
              description: 'The company may have been saved. Check it before trying again.',
            });
            return;
          }
          setError(
            `Project not saved. Failed to create company "${data.company}". Please try again.`
          );
          return;
        }
      }

      // Create artist if needed
      if (
        data.artist &&
        !['other', 'unknown'].includes(data.artist) &&
        !artistNames.includes(data.artist)
      ) {
        try {
          const existing = await ArtistsService.findByName(data.artist, user.id);
          if (!existing) {
            const draft = draftMetadata.current.artists.get(data.artist);
            const created = await createArtistMutation.mutateAsync(
              draft?.name === data.artist ? draft : { name: data.artist }
            );
            createdMetadata.push({ kind: 'artist', id: created.id });
          }
        } catch (error) {
          if (isSessionChangedError(error)) {
            notify({
              kind: 'warning',
              title: 'Session changed while adding artist',
              description: 'The artist may have been saved. Check it before trying again.',
            });
            return;
          }
          const rollbackFailures = await rollbackCreatedMetadata();
          setError(
            rollbackFailures.length > 0
              ? `Project not saved. Failed to create artist "${data.artist}". The new ${rollbackFailures.join(' and ')} may still exist. Check your metadata before trying again.`
              : `Project not saved. Failed to create artist "${data.artist}". Please try again.`
          );
          return;
        }
      }

      const projectData = toCreateProjectInput(data, user.id);

      logger.debug('Calling project creation mutation', {
        hasImage: !!projectData.imageFile,
      });

      await createProjectMutation.mutateAsync(projectData);

      // Success toast and navigation are handled by the mutation hook
      // No manual navigation needed - the hook handles redirect before cache invalidation
    } catch (error) {
      if (createdMetadata.length > 0 && !isUncertainProjectSaveError(error)) {
        const rollbackFailures = await rollbackCreatedMetadata();
        if (rollbackFailures.length > 0) {
          setError(
            `Project not saved. The new ${rollbackFailures.join(' and ')} may still exist. Check your metadata before trying again.`
          );
        }
      }
      logger.error('Failed to create project', error);
      // Mutation hook's onError handles user feedback

      const normalized = normalizeError(error, 'Project creation');
      const serverFieldErrors = mapProjectServerFieldErrors(normalized.fieldErrors);
      if (Object.keys(serverFieldErrors).length > 0) {
        setFieldErrors(serverFieldErrors);
      }

      const mimeRejection = isImageMimeRejection(error);
      if (mimeRejection && data.imageFile) {
        setImageCompatError({
          fileName: data.imageFile.name,
          fileType: data.imageFile.type,
          fileSize: data.imageFile.size,
          serverMessage: mimeRejection.message,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || isLoading.companies || isLoading.artists || isLoading.tags) {
    const pending = [
      authLoading && 'auth',
      isLoading.companies && 'companies',
      isLoading.artists && 'artists',
      isLoading.tags && 'tags',
    ].filter(Boolean);
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="border-primary mx-auto mb-4 size-8 animate-spin rounded-full border-4 border-t-transparent"></div>
              <p className="text-muted-foreground">Loading {pending.join(', ')}…</p>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!user) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="border-border bg-card rounded-lg border p-6 shadow-sm">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Alert className="mb-4 w-full max-w-md">
                <AlertDescription>Please log in to create a new project.</AlertDescription>
              </Alert>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (formData.userId !== user.id) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-6">Loading your form…</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearError}
                className="h-auto p-1"
              >
                <X className="size-4" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-6">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  draft.checkpoint();
                  navigate('/dashboard');
                }}
                disabled={submitting}
                className="gap-1.5"
              >
                <ChevronLeft className="size-4" />
                Back
              </Button>
            </div>
            <p className="font-handwritten text-primary m-0 block w-fit rotate-[-2deg] text-2xl leading-tight font-semibold tracking-tight">
              Adding
            </p>
            <h1 className="text-foreground mt-3 truncate text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
              {formData.title?.trim() || 'New project'}
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Fill in what you know. You can always come back to add more.
            </p>
          </div>
        </div>

        {completedCreateDestinations.length > 0 && (
          <Alert
            className="mb-6"
            aria-label="Late project creation"
            data-testid="late-project-creation"
          >
            <AlertDescription>
              {completedCreateDestinations.length === 1 ? 'A project was' : 'Projects were'} created
              while your session changed. Some details, including tags, may still need saving.
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {completedCreateDestinations.map((destination, index) => (
                  <li key={destination}>
                    <Link
                      to={destination}
                      className="underline"
                      onClick={() => {
                        if (user?.id) acknowledgeCompletedSessionDestination(user.id, destination);
                      }}
                    >
                      Open created project
                      {completedCreateDestinations.length > 1 ? ` ${index + 1}` : ''}
                    </Link>
                  </li>
                ))}
              </ul>
              Check each project before creating another.
            </AlertDescription>
          </Alert>
        )}

        {draft.recoverable && (
          <DraftRecoveryPanel onRestore={draft.restore} onDiscard={draft.discard} />
        )}
        {draft.storageFailed && <DraftStorageError />}
        {photoChoicePending && <DraftPhotoReminder onContinue={() => setMissingPhoto(false)} />}
        <div
          {...(draft.pending ? { inert: true } : {})}
          className="grid grid-cols-1 gap-x-12 pb-6 lg:grid-cols-[minmax(0,1fr)_320px]"
        >
          <ProjectFormSections
            formData={formData}
            companies={[...(companyNames || []), ...draftMetadata.current.companies.keys()]}
            artists={[...(artistNames || []), ...draftMetadata.current.artists.keys()]}
            isSubmitting={submitting}
            onChange={handleFormChange}
            statusBeforeDateChange={statusBeforeDateChange}
            onStatusBeforeDateChange={setStatusBeforeDateChange}
            onDraftCompany={draft => {
              draftMetadata.current.companies.set(draft.name, draft);
            }}
            onDraftArtist={draft => {
              draftMetadata.current.artists.set(draft.name, draft);
            }}
            fieldErrors={fieldErrors}
          />
        </div>

        <ProjectFormFooter
          submitting={submitting}
          disabled={!formData.title?.trim() || draft.pending || photoChoicePending}
          onCancel={handleCancel}
          onSubmit={() => handleSubmit(formData)}
          submitLabel="Create project"
          submittingLabel="Creating..."
        />

        <IncompatibleImageDialog
          open={!!imageCompatError}
          onOpenChange={o => {
            if (!o) setImageCompatError(null);
          }}
          details={imageCompatError}
        />
      </div>
    </MainLayout>
  );
};

export default NewProject;
