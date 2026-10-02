import { sessionDraftKeys } from '@/services/auth/sessionDraftKeys';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { ColoringBookForm } from '@/components/coloring/ColoringBookForm';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { notify } from '@/lib/notifications';
import { useAuth } from '@/hooks/useAuth';
import { useCompletedSessionCreate } from '@/hooks/useCompletedSessionCreate';
import { acknowledgeCompletedSessionDestination } from '@/services/auth/sessionRecovery';
import { useBookIllustrators } from '@/hooks/queries/coloring/useBookIllustrators';
import { useBookPublishers } from '@/hooks/queries/coloring/useBookPublishers';
import { useCreateBookIllustrator } from '@/hooks/mutations/coloring/useCreateBookIllustrator';
import { useCreateBookPublisher } from '@/hooks/mutations/coloring/useCreateBookPublisher';
import { useCreateColoringBook } from '@/hooks/mutations/coloring/useCreateColoringBook';
import { refreshColoringBookAfterFormSave } from '@/hooks/mutations/coloring/coloringMutationCache';
import { useAppReady } from '@/hooks/useAppReady';
import type { ColoringBookSubmitValues } from '@/schemas/coloring/coloringBook.schema';
import { createLogger } from '@/utils/logger';
import { isUncertainProjectSaveError } from '@/utils/project/projectSaveError';
import { isSessionChangedError } from '@/services/auth/sessionRecovery';

const logger = createLogger('NewColoringBook');

const optionalValue = <T,>(value: T | '') => (value === '' ? undefined : value);

const notifySafely = (notification: Parameters<typeof notify>[0]) => {
  try {
    notify(notification);
  } catch (error) {
    logger.error('Notification failed after coloring book save', error);
  }
};

const NewColoringBook = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const completedCreateDestinations = useCompletedSessionCreate(user?.id, '/coloring/');
  const publishersQuery = useBookPublishers(user?.id);
  const illustratorsQuery = useBookIllustrators(user?.id);
  const createBook = useCreateColoringBook();
  const createPublisher = useCreateBookPublisher();
  const createIllustrator = useCreateBookIllustrator();
  useAppReady();

  const handleSubmit = async (values: ColoringBookSubmitValues, onConfirmedSave: () => void) => {
    try {
      const tagIds = values.tags?.map(tag => tag.id) ?? [];
      const { book, tagSyncError } = await createBook.mutateAsync({
        input: {
          title: values.title.trim(),
          total_pages: values.totalPages,
          status: values.status,
          series: values.series?.trim() || undefined,
          theme: values.theme?.trim() || undefined,
          isbn: values.isbn?.trim() || undefined,
          source_url: values.sourceUrl?.trim() || undefined,
          notes: values.notes?.trim() || undefined,
          edition: values.edition?.trim() || undefined,
          date_purchased: values.datePurchased || undefined,
          date_received: values.dateReceived || undefined,
          date_started: values.dateStarted || undefined,
          date_completed: values.dateCompleted || undefined,
          publication_year: optionalValue(values.publicationYear),
          book_format: optionalValue(values.bookFormat),
          language: optionalValue(values.language),
          is_mystery: values.isMystery,
          publisher: values.publisher || undefined,
          illustrator: values.illustrator || undefined,
          cover_image: values.coverImage ?? undefined,
        },
        tagIds,
        onConfirmedSave,
      });

      await refreshColoringBookAfterFormSave(queryClient, book.id, 'create');

      if (tagSyncError) {
        notifySafely({
          kind: 'warning',
          title: "Coloring book added, but tags didn't save",
          description: 'Open the book to retry your tags.',
        });
      } else {
        notifySafely({
          kind: 'success',
          title: 'Coloring book added',
          description: `${book.title} is ready to track.`,
        });
      }
      navigate(`/coloring/${book.id}`);
      return true;
    } catch (error) {
      if (isSessionChangedError(error)) {
        notify({
          kind: 'warning',
          title: 'Session changed while adding book',
          description: 'Check your library before trying again.',
        });
        return false;
      }
      notify({
        kind: isUncertainProjectSaveError(error) ? 'warning' : 'error',
        title: isUncertainProjectSaveError(error)
          ? 'Coloring book creation status unknown'
          : 'Could not add coloring book',
        description: isUncertainProjectSaveError(error)
          ? 'We could not confirm whether the book was created. Check your library before trying again.'
          : error instanceof Error
            ? error.message
            : 'Please try again.',
      });
      return false;
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
                onClick={() => navigate('/dashboard?craft=coloring')}
                disabled={createBook.isPending}
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
              New coloring book
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Fill in what you know. You can always come back to add more.
            </p>
          </div>
        </div>

        {completedCreateDestinations.length > 0 && (
          <Alert className="mb-6" aria-label="Late coloring book creation">
            <AlertDescription>
              {completedCreateDestinations.length === 1
                ? 'A coloring book was'
                : 'Coloring books were'}{' '}
              created while your session changed. Some details, including tags, may still need
              saving.
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
                      Open created coloring book
                      {completedCreateDestinations.length > 1 ? ` ${index + 1}` : ''}
                    </Link>
                  </li>
                ))}
              </ul>
              Check each coloring book before creating another.
            </AlertDescription>
          </Alert>
        )}

        <ColoringBookForm
          sessionDraftKey={sessionDraftKeys.newColoringBook}
          accountId={user?.id}
          key={user?.id ?? 'signed-out'}
          publishers={publishersQuery.data?.items ?? []}
          illustrators={illustratorsQuery.data?.items ?? []}
          isSubmitting={createBook.isPending}
          submitLabel="Add book"
          submittingLabel="Adding..."
          onCancel={() => navigate('/dashboard?craft=coloring')}
          onSubmit={handleSubmit}
          onCreatePublisher={name => createPublisher.mutateAsync({ name })}
          onCreateIllustrator={name => createIllustrator.mutateAsync({ name })}
        />
      </div>
    </MainLayout>
  );
};

export default NewColoringBook;
