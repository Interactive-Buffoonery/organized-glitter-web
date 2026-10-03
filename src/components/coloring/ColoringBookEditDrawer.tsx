import { sessionDraftKeys } from '@/services/auth/sessionDraftKeys';
import { useRef, useState } from 'react';
import { Archive, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { ColoringBookForm } from '@/components/coloring/ColoringBookForm';
import { EditConflictPanel } from '@/components/drafts/EditConflictPanel';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useDeleteColoringBook } from '@/hooks/mutations/coloring/useDeleteColoringBook';
import { useCreateBookIllustrator } from '@/hooks/mutations/coloring/useCreateBookIllustrator';
import { useCreateBookPublisher } from '@/hooks/mutations/coloring/useCreateBookPublisher';
import { useSaveColoringBookEdit } from '@/hooks/mutations/coloring/useSaveColoringBookEdit';
import { useUpdateColoringBook } from '@/hooks/mutations/coloring/useUpdateColoringBook';
import { useBookIllustrators } from '@/hooks/queries/coloring/useBookIllustrators';
import { useBookPublishers } from '@/hooks/queries/coloring/useBookPublishers';
import { useColoringBook } from '@/hooks/queries/coloring/useColoringBook';
import { useAuth } from '@/hooks/useAuth';
import { useKeyboardSafeViewportStyle } from '@/hooks/useKeyboardSafeViewportStyle';
import { useFocusAfterEditRecovery } from '@/hooks/useFocusAfterEditRecovery';
import { useMobileDevice } from '@/hooks/use-mobile';
import { notify } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import type { ColoringBookSubmitValues } from '@/schemas/coloring/coloringBook.schema';
import { getColoringBookSaveErrorMessage } from '@/components/coloring/getColoringBookSaveErrorMessage';
import { ColoringService } from '@/services/pocketbase/coloring.service';
import { ColoringBooksStatusOptions } from '@/types/pocketbase.types';
import { hasErrorStatus } from '@/services/errors';

const COLORING_DASHBOARD_PATH = '/dashboard?craft=coloring';
const FORM_ID = 'coloring-book-edit-drawer-form';

type ConfirmationAction = 'archive' | 'delete';

interface ColoringBookEditDrawerProps {
  bookId: string | undefined;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const ColoringBookEditDrawer = ({
  bookId,
  isOpen,
  onOpenChange,
  onSaved,
}: ColoringBookEditDrawerProps) => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, initialCheckComplete } = useAuth();
  const { isPhone } = useMobileDevice();
  const phoneDrawerStyle = useKeyboardSafeViewportStyle(isPhone && isOpen);
  const bookQuery = useColoringBook(bookId);
  const publishersQuery = useBookPublishers(user?.id);
  const illustratorsQuery = useBookIllustrators(user?.id);
  const saveEdit = useSaveColoringBookEdit();
  const archiveBook = useUpdateColoringBook();
  const deleteBook = useDeleteColoringBook();
  const createPublisher = useCreateBookPublisher();
  const createIllustrator = useCreateBookIllustrator();
  const [confirmationAction, setConfirmationAction] = useState<ConfirmationAction | null>(null);
  const [draftBlocked, setDraftBlocked] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [acceptedRevision, setAcceptedRevision] = useState<number | null>(null);
  const draftRetireRef = useRef<(() => void) | null>(null);
  const dismissRef = useRef<(() => boolean) | null>(null);

  const handleOpenChange = (open: boolean) => {
    if (open || !dismissRef.current) {
      onOpenChange(open);
      return;
    }
    dismissRef.current();
  };

  const authReady = initialCheckComplete && !authLoading;
  const book =
    authReady && user?.id && bookQuery.data?.userId === user.id ? bookQuery.data : undefined;
  const recoverAndFocus = useFocusAfterEditRecovery({
    active: Boolean(isOpen && book && user?.id),
    identity: `${user?.id ?? 'signed-out'}:${bookId ?? ''}`,
    saveButtonId: 'coloring-drawer-save',
  });
  const bookUnavailable = authReady && !bookQuery.isLoading && !book;
  const submitting = saveEdit.isPending || archiveBook.isPending || deleteBook.isPending;
  const titleText = book?.title || 'Edit coloring book';
  const publisherName = book?.publisherId
    ? publishersQuery.data?.items.find(publisher => publisher.id === book.publisherId)?.name
    : '';
  const illustratorName = book?.illustratorId
    ? illustratorsQuery.data?.items.find(illustrator => illustrator.id === book.illustratorId)?.name
    : '';
  const headerSubtitle = [
    titleText,
    publisherName,
    illustratorName ? `Illustrated by ${illustratorName}` : '',
  ]
    .filter(Boolean)
    .join(' - ');

  const TitleEl = isPhone ? DrawerTitle : SheetTitle;
  const DescriptionEl = isPhone ? DrawerDescription : SheetDescription;

  const handleSubmit = async (
    values: ColoringBookSubmitValues,
    onConfirmedSave: () => void,
    expectedRevision?: number,
    changedTagIds?: string[]
  ) => {
    if (!book) return false;

    try {
      await saveEdit.saveColoringBookEdit(
        book,
        values,
        onConfirmedSave,
        expectedRevision ?? book.revision ?? 0,
        changedTagIds
      );
      onSaved?.();
      onOpenChange(false);
      return true;
    } catch (error) {
      if (hasErrorStatus(error, 409)) {
        setConflict(true);
        return false;
      }
      notify({
        kind: 'error',
        title: 'Could not update coloring book',
        description: getColoringBookSaveErrorMessage(error),
      });
      return false;
    }
  };

  const useLatestRevision = async () => {
    const latest = await bookQuery.refetch();
    if (latest.isError || !latest.data || latest.data.userId !== user?.id) {
      notify({
        kind: 'error',
        title: 'Could not load latest coloring book',
        description: 'Your edits are still here. Try again.',
      });
      return false;
    }
    setAcceptedRevision(latest.data.revision ?? 0);
    setConflict(false);
    return true;
  };

  const handleArchive = async () => {
    if (!book) return;

    try {
      await archiveBook.mutateAsync({
        bookId: book.id,
        patch: { status: ColoringBooksStatusOptions.archived },
      });
      draftRetireRef.current?.();
      navigate(COLORING_DASHBOARD_PATH);
    } catch (error) {
      notify({
        kind: 'error',
        title: 'Archive failed',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handleDelete = async () => {
    if (!book) return;

    try {
      await deleteBook.mutateAsync(book.id);
      draftRetireRef.current?.();
      navigate(COLORING_DASHBOARD_PATH);
    } catch (error) {
      notify({
        kind: 'error',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handleConfirmAction = async () => {
    const action = confirmationAction;
    setConfirmationAction(null);

    if (action === 'archive') {
      await handleArchive();
      return;
    }

    if (action === 'delete') {
      await handleDelete();
    }
  };

  const body = (
    <>
      <header
        className={cn(
          'border-border flex shrink-0 flex-col gap-1 border-b px-6 pb-4',
          isPhone ? 'pt-4' : 'pt-5 pr-14'
        )}
      >
        <TitleEl className="text-lg font-semibold">Edit coloring book</TitleEl>
        <DescriptionEl className="text-muted-foreground truncate text-sm">
          {authLoading || !initialCheckComplete || bookQuery.isLoading
            ? 'Loading book…'
            : headerSubtitle}
        </DescriptionEl>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {conflict && book && (
          <EditConflictPanel
            itemName="coloring book"
            detailPath={`/coloring/${book.id}`}
            onUseLatest={() => recoverAndFocus(useLatestRevision)}
            focusOnMount
          />
        )}
        {book ? (
          <ColoringBookForm
            sessionDraftKey={sessionDraftKeys.coloringBookEdit(book.id, 'drawer')}
            accountId={user?.id}
            key={`${user?.id ?? 'signed-out'}:${book.id}`}
            formId={FORM_ID}
            layout="drawer"
            showFooter={false}
            initialBook={book}
            expectedRevisionOverride={acceptedRevision ?? undefined}
            onSessionDraftConflict={setConflict}
            coverUrl={ColoringService.getCoverImageUrl(book)}
            publishers={publishersQuery.data?.items ?? []}
            illustrators={illustratorsQuery.data?.items ?? []}
            isSubmitting={submitting}
            submitLabel="Save changes"
            submittingLabel="Saving…"
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSubmit}
            onDraftBlockChange={setDraftBlocked}
            draftRetireRef={draftRetireRef}
            dismissRef={dismissRef}
            onCreatePublisher={name => createPublisher.mutateAsync({ name })}
            onCreateIllustrator={name => createIllustrator.mutateAsync({ name })}
          />
        ) : (
          <div className="text-muted-foreground text-sm" role="status" aria-busy={!bookUnavailable}>
            {bookUnavailable ? 'Coloring book unavailable.' : 'Loading book…'}
          </div>
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
          onClick={() => setConfirmationAction('archive')}
          disabled={submitting || !book}
          aria-label="Archive coloring book"
          className="text-muted-foreground hover:text-foreground"
        >
          <Archive className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setConfirmationAction('delete')}
          disabled={submitting || !book}
          aria-label="Delete coloring book"
          className="text-destructive-text hover:text-destructive-text hover:bg-destructive/10"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" type="reset" form={FORM_ID} disabled={submitting}>
            Cancel
          </Button>
          <Button
            id="coloring-drawer-save"
            type="submit"
            form={FORM_ID}
            disabled={submitting || !book || draftBlocked}
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      <AlertDialog
        open={confirmationAction !== null}
        onOpenChange={open => {
          if (!open) setConfirmationAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmationAction === 'archive'
                ? 'Archive coloring book?'
                : 'Delete this coloring book?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmationAction === 'archive'
                ? 'This moves the book out of your active coloring library.'
                : 'This removes the book and all generated page records.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmAction()}
              className={
                confirmationAction === 'delete'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : undefined
              }
            >
              {confirmationAction === 'archive' ? 'Archive' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

export default ColoringBookEditDrawer;
