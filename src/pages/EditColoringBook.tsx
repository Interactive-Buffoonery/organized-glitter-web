import { useEffect, useState } from 'react';
import { sessionDraftKeys } from '@/services/auth/sessionDraftKeys';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { ColoringBookForm } from '@/components/coloring/ColoringBookForm';
import { EditConflictPanel } from '@/components/drafts/EditConflictPanel';
import { getColoringBookSaveErrorMessage } from '@/components/coloring/getColoringBookSaveErrorMessage';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notifications';
import { useAuth } from '@/hooks/useAuth';
import { useBookIllustrators } from '@/hooks/queries/coloring/useBookIllustrators';
import { useBookPublishers } from '@/hooks/queries/coloring/useBookPublishers';
import { useColoringBook } from '@/hooks/queries/coloring/useColoringBook';
import { useCreateBookIllustrator } from '@/hooks/mutations/coloring/useCreateBookIllustrator';
import { useCreateBookPublisher } from '@/hooks/mutations/coloring/useCreateBookPublisher';
import { useSaveColoringBookEdit } from '@/hooks/mutations/coloring/useSaveColoringBookEdit';
import { useAppReady } from '@/hooks/useAppReady';
import { useFocusAfterEditRecovery } from '@/hooks/useFocusAfterEditRecovery';
import { usePageMetadata } from '@/hooks/usePageMetadata';
import { ColoringService } from '@/services/pocketbase/coloring.service';
import type { ColoringBookSubmitValues } from '@/schemas/coloring/coloringBook.schema';
import { hasErrorStatus } from '@/services/errors';

const COLORING_DASHBOARD_PATH = '/dashboard?craft=coloring';

const EditColoringBookSession = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const bookQuery = useColoringBook(id);
  const publishersQuery = useBookPublishers(user?.id);
  const illustratorsQuery = useBookIllustrators(user?.id);
  const saveEdit = useSaveColoringBookEdit();
  const createPublisher = useCreateBookPublisher();
  const createIllustrator = useCreateBookIllustrator();
  const [conflict, setConflict] = useState(false);
  const [acceptedRevision, setAcceptedRevision] = useState<number | null>(null);

  useEffect(() => {
    setConflict(false);
    setAcceptedRevision(null);
  }, [id, user?.id]);

  const book = bookQuery.data?.userId === user?.id ? bookQuery.data : undefined;
  const recoverAndFocus = useFocusAfterEditRecovery({
    active: Boolean(book && user?.id),
    identity: `${user?.id ?? 'signed-out'}:${id ?? ''}`,
    saveButtonId: 'coloring-edit-save',
  });
  useAppReady();
  usePageMetadata({
    title: bookQuery.isLoading
      ? 'Edit coloring book | Organized Glitter'
      : book
        ? `Edit ${book.title || 'untitled coloring book'} | Organized Glitter`
        : 'Coloring book not found | Organized Glitter',
  });

  const handleCancel = () => {
    navigate(id ? `/coloring/${id}` : COLORING_DASHBOARD_PATH);
  };

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
      navigate(`/coloring/${book.id}`);
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
    if (
      latest.isError ||
      !latest.data ||
      latest.data.id !== id ||
      latest.data.userId !== user?.id
    ) {
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

  if (bookQuery.isLoading) {
    return (
      <MainLayout>
        <div className="container mx-auto flex min-h-[50vh] items-center justify-center px-4">
          <Loader2 className="text-muted-foreground size-8 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (!book) {
    return (
      <MainLayout>
        <section className="container mx-auto px-4 py-6">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="gap-1.5"
          >
            <ChevronLeft className="size-4" />
            Back
          </Button>
          <div className="mt-8 rounded-lg border p-8 text-center">
            <h1 className="text-xl font-semibold">Coloring book not found</h1>
          </div>
        </section>
      </MainLayout>
    );
  }

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
                disabled={saveEdit.isPending}
                className="gap-1.5"
              >
                <ChevronLeft className="size-4" />
                Back
              </Button>
            </div>
            <h1 className="text-foreground mt-3 truncate text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
              Edit book
            </h1>
          </div>
        </div>

        {conflict && (
          <EditConflictPanel
            itemName="coloring book"
            detailPath={`/coloring/${book.id}`}
            onUseLatest={() => recoverAndFocus(useLatestRevision)}
            focusOnMount
          />
        )}
        <ColoringBookForm
          sessionDraftKey={sessionDraftKeys.coloringBookEdit(book.id, 'page')}
          accountId={user?.id}
          key={`${user?.id ?? 'signed-out'}:${book.id}`}
          initialBook={book}
          expectedRevisionOverride={acceptedRevision ?? undefined}
          onSessionDraftConflict={setConflict}
          saveButtonId="coloring-edit-save"
          coverUrl={ColoringService.getCoverImageUrl(book)}
          publishers={publishersQuery.data?.items ?? []}
          illustrators={illustratorsQuery.data?.items ?? []}
          isSubmitting={saveEdit.isPending}
          submitLabel="Update book"
          submittingLabel="Saving..."
          onCancel={handleCancel}
          onSubmit={handleSubmit}
          onCreatePublisher={name => createPublisher.mutateAsync({ name })}
          onCreateIllustrator={name => createIllustrator.mutateAsync({ name })}
        />
      </div>
    </MainLayout>
  );
};

const EditColoringBook = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  return <EditColoringBookSession key={`${user?.id ?? 'signed-out'}:${id ?? ''}`} />;
};

export default EditColoringBook;
