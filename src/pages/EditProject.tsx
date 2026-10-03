import { useParams, useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/hooks/useAuth';
import { useEditProject } from '@/hooks/useEditProject';
import { useFocusAfterEditRecovery } from '@/hooks/useFocusAfterEditRecovery';
import {
  DraftPhotoReminder,
  DraftRecoveryPanel,
  DraftStorageError,
} from '@/components/drafts/DraftRecoveryPanel';
import { EditProjectNotFound } from '@/components/projects/EditProjectNotFound';
import { EditConflictPanel } from '@/components/drafts/EditConflictPanel';
import EditProjectSkeleton from '@/components/projects/EditProjectSkeleton';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Archive, Trash2, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ProjectFormSections from '@/components/projects/ProjectFormSections';
import { ProjectFormFooter } from '@/components/projects/form/ProjectFormFooter';
import { IncompatibleImageDialog } from '@/components/projects/IncompatibleImageDialog';
import { logger, createLogger } from '@/utils/logger';
import { useAppReady } from '@/hooks/useAppReady';
import { usePageMetadata } from '@/hooks/usePageMetadata';
// Debug component removed for PocketBase migration

const pageLogger = createLogger('EditProject');

const EditProjectSession = () => {
  useAppReady();
  const { id } = useParams<{ id: string }>();
  const { user, isAuthenticated, initialCheckComplete, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const {
    project,
    loading,
    submitting,
    companies,
    artists,
    formData,
    fieldErrors,
    conflict,
    draft,
    photoChoicePending,
    statusBeforeDateChange,
    setStatusBeforeDateChange,
    continueWithoutPhoto,
    imageCompatError,
    confirmDiscard,
    clearImageCompatError,
    handleFormDataChange,
    handleSubmit,
    useLatestRevision,
    handleArchive,
    handleDelete,
    ConfirmationDialog,
    error,
  } = useEditProject(id);
  const recoverAndFocus = useFocusAfterEditRecovery({
    active: Boolean(isAuthenticated && project && formData),
    identity: `${user?.id ?? 'signed-out'}:${id ?? ''}`,
    saveButtonId: 'project-edit-save',
  });
  const pageTitle =
    !loading && isAuthenticated && initialCheckComplete && (!project || error)
      ? 'Project not found | Organized Glitter'
      : project
        ? `Edit ${formData?.title?.trim() || project.title || 'untitled project'} | Organized Glitter`
        : 'Edit project | Organized Glitter';
  usePageMetadata({ title: pageTitle });

  const handleCancel = () => {
    confirmDiscard(() => navigate(id ? `/projects/${id}` : '/dashboard'));
  };
  const handleDiscardAndLeave = () => {
    handleCancel();
  };

  // Show loading state while fetching project data or during auth check
  if (loading || authLoading || !initialCheckComplete) {
    return (
      <MainLayout>
        <EditProjectSkeleton />
      </MainLayout>
    );
  }

  // Show not found state if project doesn't exist (but only after auth is confirmed)
  if ((!project || error) && !loading && isAuthenticated && initialCheckComplete) {
    return <EditProjectNotFound />;
  }

  // If we get here without a project and without proper auth state, show loading
  if (!project) {
    return (
      <MainLayout>
        <EditProjectSkeleton />
      </MainLayout>
    );
  }

  const handleManualSave = async () => {
    if (!formData) {
      pageLogger.warn('🚫 Manual save clicked but no form data available', {
        projectId: id,
      });
      return;
    }
    pageLogger.debug('📝 Manual save button clicked', {
      projectId: id,
      hasFormData: !!formData,
    });
    try {
      await handleSubmit(formData);
      pageLogger.info('✅ Manual save completed successfully', { projectId: id });
    } catch (error) {
      pageLogger.error('❌ Manual save failed', { projectId: id, error });
      logger.error('Error submitting form:', error);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-6">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={submitting}
                className="gap-1.5"
              >
                <ChevronLeft className="size-4" />
                Back
              </Button>
            </div>
            <p className="font-handwritten text-primary m-0 block w-fit rotate-[-2deg] text-2xl leading-tight font-semibold tracking-tight">
              Editing
            </p>
            <h1 className="text-foreground mt-3 truncate text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
              {formData?.title?.trim() || project.title || 'Untitled project'}
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Make changes below. Nothing saves until you hit Update.
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={submitting} aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleArchive} disabled={submitting}>
                <Archive className="mr-2 size-4" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                disabled={submitting}
                className="text-destructive-text focus:text-destructive-text focus:bg-destructive/10"
              >
                <Trash2 className="mr-2 size-4" />
                Delete project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {draft.recoverable && (
          <DraftRecoveryPanel
            changedOnServer={draft.recoverable.baselineUpdatedAt !== project.updatedAt}
            onRestore={draft.restore}
            onDiscard={draft.discard}
          />
        )}
        {draft.storageFailed && <DraftStorageError />}
        {conflict && (
          <EditConflictPanel
            itemName="project"
            detailPath={`/projects/${project.id}`}
            onUseLatest={() => recoverAndFocus(useLatestRevision)}
            focusOnMount
          />
        )}
        {photoChoicePending && <DraftPhotoReminder onContinue={continueWithoutPhoto} />}
        <div
          {...(draft.pending ? { inert: true } : {})}
          className="grid grid-cols-1 gap-x-12 pb-6 lg:grid-cols-[minmax(0,1fr)_320px]"
        >
          {formData ? (
            <ProjectFormSections
              formData={formData}
              companies={companies}
              artists={artists}
              isSubmitting={submitting}
              onChange={handleFormDataChange}
              statusBeforeDateChange={statusBeforeDateChange}
              onStatusBeforeDateChange={setStatusBeforeDateChange}
              savedDateCompleted={project.dateCompleted}
              fieldErrors={fieldErrors}
            />
          ) : null}
        </div>

        <ProjectFormFooter
          saveButtonId="project-edit-save"
          submitting={submitting}
          disabled={!formData || draft.pending || photoChoicePending}
          onCancel={handleDiscardAndLeave}
          onSubmit={handleManualSave}
          submitLabel="Update project"
          submittingLabel="Saving..."
        />

        <ConfirmationDialog />
        <IncompatibleImageDialog
          open={!!imageCompatError}
          onOpenChange={o => {
            if (!o) clearImageCompatError();
          }}
          details={imageCompatError}
        />
      </div>
    </MainLayout>
  );
};

const EditProject = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  return <EditProjectSession key={`${user?.id ?? 'signed-out'}:${id ?? ''}`} />;
};

export default EditProject;
