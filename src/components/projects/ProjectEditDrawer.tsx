import { Archive, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useEditProject } from '@/hooks/useEditProject';
import { useFocusAfterEditRecovery } from '@/hooks/useFocusAfterEditRecovery';
import {
  DraftPhotoReminder,
  DraftRecoveryPanel,
  DraftStorageError,
} from '@/components/drafts/DraftRecoveryPanel';
import { useKeyboardSafeViewportStyle } from '@/hooks/useKeyboardSafeViewportStyle';
import { useMobileDevice } from '@/hooks/use-mobile';
import ProjectFormSections from '@/components/projects/ProjectFormSections';
import { IncompatibleImageDialog } from '@/components/projects/IncompatibleImageDialog';
import { EditConflictPanel } from '@/components/drafts/EditConflictPanel';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { cn } from '@/lib/utils';

interface ProjectEditDrawerProps {
  projectId: string | undefined;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const ProjectEditDrawer = ({
  projectId,
  isOpen,
  onOpenChange,
  onSaved,
}: ProjectEditDrawerProps) => {
  const { isPhone } = useMobileDevice();
  const phoneDrawerStyle = useKeyboardSafeViewportStyle(isPhone && isOpen);
  const queryClient = useQueryClient();

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
    clearImageCompatError,
    handleFormDataChange,
    handleSubmit,
    useLatestRevision,
    handleArchive,
    handleDelete,
    confirmDiscard,
    ConfirmationDialog,
  } = useEditProject(projectId, { navigateOnSubmit: false });
  const recoverAndFocus = useFocusAfterEditRecovery({
    active: Boolean(isOpen && project && formData),
    identity: `${project?.userId ?? 'signed-out'}:${projectId ?? ''}`,
    saveButtonId: 'project-drawer-save',
  });

  const handleSave = async () => {
    if (!formData || !projectId) return;
    const ok = await handleSubmit(formData);
    if (ok) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      onSaved?.();
      onOpenChange(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      onOpenChange(true);
      return;
    }
    confirmDiscard(() => onOpenChange(false));
  };

  const headerSubtitle = project?.company || (loading ? 'Loading project…' : undefined);
  const titleText = formData?.title?.trim() || project?.title || 'Edit project';

  const TitleEl = isPhone ? DrawerTitle : SheetTitle;
  const DescriptionEl = isPhone ? DrawerDescription : SheetDescription;

  const body = (
    <>
      <header
        className={cn(
          'border-border flex shrink-0 flex-col gap-1 border-b px-6 pb-4',
          isPhone ? 'pt-4' : 'pt-5 pr-14'
        )}
      >
        <TitleEl className="text-lg font-semibold">Edit project</TitleEl>
        <DescriptionEl className="text-muted-foreground truncate text-sm">
          {headerSubtitle ? `${titleText} · ${headerSubtitle}` : titleText}
        </DescriptionEl>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {draft.recoverable && (
          <DraftRecoveryPanel
            changedOnServer={draft.recoverable.baselineUpdatedAt !== project?.updatedAt}
            onRestore={draft.restore}
            onDiscard={draft.discard}
          />
        )}
        {draft.storageFailed && <DraftStorageError />}
        {conflict && project && (
          <EditConflictPanel
            itemName="project"
            detailPath={`/projects/${project.id}`}
            onUseLatest={() => recoverAndFocus(useLatestRevision)}
          />
        )}
        {photoChoicePending && <DraftPhotoReminder onContinue={continueWithoutPhoto} />}
        {formData ? (
          <div {...(draft.pending ? { inert: true } : {})} className="space-y-8">
            <ProjectFormSections
              formData={formData}
              companies={companies}
              artists={artists}
              isSubmitting={submitting}
              onChange={handleFormDataChange}
              statusBeforeDateChange={statusBeforeDateChange}
              onStatusBeforeDateChange={setStatusBeforeDateChange}
              savedDateCompleted={project?.dateCompleted}
              fieldErrors={fieldErrors}
              layout="drawer"
            />
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">Loading project…</div>
        )}
      </div>

      <div
        className={cn(
          'border-border bg-background/95 flex shrink-0 items-center gap-2 border-t px-4 py-3 backdrop-blur sm:gap-3 sm:px-6 sm:py-4',
          'pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(1rem+env(safe-area-inset-bottom))]'
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleArchive}
          disabled={submitting || !project}
          aria-label="Archive project"
          className="text-muted-foreground hover:text-foreground"
        >
          <Archive className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          disabled={submitting || !project}
          aria-label="Delete project"
          className="text-destructive-text hover:text-destructive-text hover:bg-destructive/10"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => confirmDiscard(() => onOpenChange(false))}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            id="project-drawer-save"
            type="button"
            onClick={handleSave}
            disabled={submitting || !formData || draft.pending || photoChoicePending}
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      <ConfirmationDialog />
      <IncompatibleImageDialog
        open={!!imageCompatError}
        onOpenChange={o => {
          if (!o) clearImageCompatError();
        }}
        details={imageCompatError}
      />
    </>
  );

  if (isPhone) {
    return (
      <Drawer
        open={isOpen}
        onOpenChange={handleOpenChange}
        shouldScaleBackground={false}
        repositionInputs={false}
      >
        <DrawerContent className="flex flex-col" style={phoneDrawerStyle}>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex size-full flex-col gap-0 p-0 sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
      >
        {body}
      </SheetContent>
    </Sheet>
  );
};

export default ProjectEditDrawer;
