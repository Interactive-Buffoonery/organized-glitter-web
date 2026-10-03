import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import ColoringBookEditDrawer from '@/components/coloring/ColoringBookEditDrawer';
import { ColoringBookDetailActions } from '@/components/coloring/detail/ColoringBookDetailActions';
import { ColoringDetailUnavailable } from '@/components/coloring/detail/ColoringDetailUnavailable';
import { ColoringDetailRefreshNotice } from '@/components/coloring/detail/ColoringDetailRefreshNotice';
import { ColoringDetailRetryAnnouncements } from '@/components/coloring/detail/ColoringDetailRetryAnnouncements';
import { ColoringBookDetailsSection } from '@/components/coloring/detail/ColoringBookDetailsSection';
import {
  visibleItems,
  type ColoringBookMetadataItem,
} from '@/components/coloring/detail/coloringBookDetailData';
import { ColoringBookHero } from '@/components/coloring/detail/ColoringBookHero';
import { ColoringBookNotesSection } from '@/components/coloring/detail/ColoringBookNotesSection';
import { ColoringBookPagesSection } from '@/components/coloring/detail/ColoringBookPagesSection';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notifications';
import { useAuth } from '@/hooks/useAuth';
import { hasSessionDraft } from '@/services/auth/sessionRecovery';
import { sessionDraftKeys } from '@/services/auth/sessionDraftKeys';
import { useBookIllustrators } from '@/hooks/queries/coloring/useBookIllustrators';
import { useBookPublishers } from '@/hooks/queries/coloring/useBookPublishers';
import { useColoringBook } from '@/hooks/queries/coloring/useColoringBook';
import { useColoringBookTags } from '@/hooks/queries/coloring/useColoringBookTags';
import { useColoringPages } from '@/hooks/queries/coloring/useColoringPages';
import { useDeleteColoringBook } from '@/hooks/mutations/coloring/useDeleteColoringBook';
import { useSyncColoringBookTags } from '@/hooks/mutations/coloring/useSyncColoringBookTags';
import { useUpdateColoringBook } from '@/hooks/mutations/coloring/useUpdateColoringBook';
import { useAppReady } from '@/hooks/useAppReady';
import { useDetailRetryState } from '@/hooks/coloring/useDetailRetryState';
import { usePageMetadata } from '@/hooks/usePageMetadata';
import { ColoringService } from '@/services/pocketbase/coloring.service';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import { isServiceResponseError } from '@/types/shared';
import type { ColoringBooksStatusOptions as ColoringBookStatus } from '@/types/pocketbase.types';
import {
  formatColoringBookDate,
  getColoringBookFormatLabel,
  getColoringBookLanguageLabel,
} from '@/components/coloring/coloringBookPresentation';
import type { Tag } from '@/types/tag';
import { getColoringDashboardReturnPath } from './coloringBookNavigation';

const COLORING_PAGE_BATCH_SIZE = 500;

const ColoringBookDetail = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const bookQuery = useColoringBook(id);
  const book = bookQuery.data;
  const bookRetry = useDetailRetryState('coloring book', `${id}:${location.key}`);
  const pagesRetry = useDetailRetryState('coloring book pages', `${id}:${location.key}`);
  const [retryError, setRetryError] = useState<unknown>(null);
  const displayedBookError = bookQuery.error ?? (bookRetry.isRetrying ? retryError : null);
  const bookFailure = displayedBookError ? ErrorHandler.handleError(displayedBookError) : null;
  const bookAccessFailed = ErrorHandler.isAccessFailure(bookFailure?.type);
  const [pagesPagination, setPagesPagination] = useState({ bookId: id, page: 1 });
  const selectedPage = pagesPagination.bookId === id ? pagesPagination.page : 1;
  const lastPagesPage = book
    ? Math.max(1, Math.ceil(book.totalPages / COLORING_PAGE_BATCH_SIZE))
    : selectedPage;
  const pagesPage = Math.min(selectedPage, lastPagesPage);
  const pagesQuery = useColoringPages(
    id
      ? {
          bookId: id,
          sort: 'page_number',
          page: pagesPage,
          perPage: COLORING_PAGE_BATCH_SIZE,
        }
      : undefined
  );
  const retryBook = () => {
    setRetryError(bookQuery.error);
    void bookRetry.retry(async () => !(await bookQuery.refetch()).isError);
  };
  const retryPages = () => {
    void pagesRetry.retry(async () => !(await pagesQuery.refetch()).isError);
  };
  const tagsQuery = useColoringBookTags(id);
  const publishersQuery = useBookPublishers(user?.id);
  const illustratorsQuery = useBookIllustrators(user?.id);
  const updateBook = useUpdateColoringBook();
  const deleteBook = useDeleteColoringBook();
  const syncBookTags = useSyncColoringBookTags();
  const [editDrawerOpen, setEditDrawerOpen] = useState(() =>
    id && user?.id
      ? hasSessionDraft(sessionDraftKeys.coloringBookEdit(id, 'drawer'), user.id)
      : false
  );
  const requestedReturnTo = (location.state as { returnTo?: unknown } | null)?.returnTo;
  const dashboardPath = getColoringDashboardReturnPath(
    requestedReturnTo ?? new URLSearchParams(location.search).get('returnTo')
  );
  // Dismiss splash on mount; book detail still uses in-app loading UI.
  useAppReady();

  useEffect(() => {
    setPagesPagination(current => (current.bookId === id ? current : { bookId: id, page: 1 }));
  }, [id]);

  usePageMetadata({
    title:
      book && !bookAccessFailed
        ? `${book.title || 'Untitled coloring book'} | Organized Glitter`
        : bookQuery.isLoading
          ? 'Coloring book details | Organized Glitter'
          : bookFailure && bookFailure.type !== 'not_found'
            ? 'Coloring book unavailable | Organized Glitter'
            : 'Coloring book not found | Organized Glitter',
  });
  const pages = useMemo(() => pagesQuery.data?.items ?? [], [pagesQuery.data?.items]);
  const tags = book?.tags?.length ? book.tags : (tagsQuery.data ?? []);

  const completedPages = book?.completedPages ?? 0;
  const completionPct = book?.completionPercentage ?? 0;
  const safeCompletedPages = book ? Math.max(0, Math.min(completedPages, book.totalPages)) : 0;
  const safeCompletionPct = Math.max(0, Math.min(completionPct, 100));

  const handlePagesPageChange = (nextPage: number) => {
    if (!book) return;
    setPagesPagination({
      bookId: book.id,
      page: Math.max(1, Math.min(nextPage, lastPagesPage)),
    });
  };

  const publisherName = useMemo(() => {
    if (!book?.publisherId) return book?.publisherName ?? '';
    return (
      publishersQuery.data?.items.find(publisher => publisher.id === book.publisherId)?.name ??
      book.publisherName ??
      ''
    );
  }, [book?.publisherId, book?.publisherName, publishersQuery.data?.items]);

  const illustratorName = useMemo(() => {
    if (!book?.illustratorId) return book?.illustratorName ?? '';
    return (
      illustratorsQuery.data?.items.find(illustrator => illustrator.id === book.illustratorId)
        ?.name ??
      book.illustratorName ??
      ''
    );
  }, [book?.illustratorId, book?.illustratorName, illustratorsQuery.data?.items]);

  const coverUrl = book?.coverImage ? ColoringService.getCoverImageUrl(book) : '';

  const handleStatusChange = async (status: ColoringBookStatus) => {
    if (!book || status === book.status) return;
    try {
      await updateBook.mutateAsync({ bookId: book.id, patch: { status } });
    } catch (error) {
      notify({
        kind: 'error',
        title: 'Status update failed',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handleDelete = async () => {
    if (!book) return;
    try {
      await deleteBook.mutateAsync(book.id);
      navigate(dashboardPath);
    } catch (error) {
      notify({
        kind: 'error',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const handleNotesSave = async (nextNotes: string) => {
    if (!book) return;
    try {
      await updateBook.mutateAsync({ bookId: book.id, patch: { notes: nextNotes } });
    } catch (error) {
      notify({
        kind: 'error',
        title: 'Notes did not save',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
      throw error;
    }
  };

  const handleTagsChange = async (nextTags: Tag[]) => {
    if (!book) return;
    try {
      const result = await syncBookTags.mutateAsync({
        bookId: book.id,
        tagIds: nextTags.map(tag => tag.id),
      });
      if (isServiceResponseError(result)) {
        notify({
          kind: 'warning',
          title: "Tags didn't save",
          description: result.error?.message || 'Please try again.',
        });
        return;
      }
    } catch (error) {
      notify({
        kind: 'error',
        title: "Tags didn't save",
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  if (bookQuery.isLoading && !bookRetry.isRetrying) {
    return (
      <MainLayout>
        <ColoringDetailRetryAnnouncements
          primary={bookRetry.announcement}
          secondary={pagesRetry.announcement}
          loadingText="Loading coloring book"
        />
        <div
          className="container mx-auto flex min-h-[50vh] items-center justify-center gap-2 px-4"
          aria-hidden="true"
        >
          <Loader2 className="text-muted-foreground size-8 animate-spin" aria-hidden="true" />
        </div>
      </MainLayout>
    );
  }

  if (!book || bookAccessFailed) {
    return (
      <MainLayout>
        <ColoringDetailRetryAnnouncements
          primary={bookRetry.announcement}
          secondary={pagesRetry.announcement}
        />
        <ColoringDetailUnavailable
          kind="book"
          error={displayedBookError}
          backPath={dashboardPath}
          backLabel="Back to coloring"
          onRetry={retryBook}
          isRetrying={bookRetry.isRetrying}
        />
      </MainLayout>
    );
  }

  const metadataLine = [
    publisherName,
    illustratorName ? `Illustrated by ${illustratorName}` : '',
    book.series,
  ]
    .filter(Boolean)
    .join(' · ');

  const detailItems: ColoringBookMetadataItem[] = [
    { label: 'Publisher', value: publisherName },
    { label: 'Illustrator', value: illustratorName },
    { label: 'Series', value: book.series },
    { label: 'Theme', value: book.theme },
    { label: 'ISBN', value: book.isbn },
    { label: 'Publication year', value: book.publicationYear },
    { label: 'Edition', value: book.edition },
    {
      label: 'Language',
      value: book.language ? getColoringBookLanguageLabel(book.language) : '',
    },
    { label: 'Format', value: book.bookFormat ? getColoringBookFormatLabel(book) : '' },
    { label: 'Source link', value: book.sourceUrl, href: book.sourceUrl },
    { label: 'Purchased', value: formatColoringBookDate(book.datePurchased) },
    { label: 'Received', value: formatColoringBookDate(book.dateReceived) },
    { label: 'Started', value: formatColoringBookDate(book.dateStarted) },
    { label: 'Completed', value: formatColoringBookDate(book.dateCompleted) },
  ];
  const hasDetails = visibleItems(detailItems).length > 0;

  return (
    <MainLayout>
      <ColoringDetailRetryAnnouncements
        primary={bookRetry.announcement}
        secondary={pagesRetry.announcement}
      />
      <section className="container mx-auto max-w-6xl space-y-8 px-4 py-6 lg:py-8">
        <ColoringBookDetailActions
          dashboardPath={dashboardPath}
          updatePending={updateBook.isPending}
          onEdit={() => setEditDrawerOpen(true)}
          onDelete={handleDelete}
        />

        {bookFailure && (
          <ColoringDetailRefreshNotice
            kind="book"
            retryable={bookFailure.retryable}
            onRetry={retryBook}
            isRetrying={bookRetry.isRetrying}
          />
        )}

        <ColoringBookHero
          book={book}
          coverUrl={coverUrl}
          metadataLine={metadataLine}
          safeCompletedPages={safeCompletedPages}
          safeCompletionPct={safeCompletionPct}
          tags={tags}
          updatePending={updateBook.isPending}
          isSavingTags={syncBookTags.isPending}
          onStatusChange={handleStatusChange}
          onTagsChange={handleTagsChange}
        />

        <ColoringBookPagesSection
          book={book}
          pages={pages}
          isLoading={pagesQuery.isLoading}
          error={pagesQuery.error}
          hasLoadedData={Boolean(pagesQuery.data)}
          isFetching={pagesQuery.isFetching}
          isRetrying={pagesRetry.isRetrying}
          onRetry={retryPages}
          page={pagesPage}
          perPage={COLORING_PAGE_BATCH_SIZE}
          totalItems={book.totalPages}
          returnTo={dashboardPath}
          onPageChange={handlePagesPageChange}
        />

        <div className={cn('grid gap-8', hasDetails && 'lg:grid-cols-2 lg:items-start lg:gap-10')}>
          {hasDetails ? <ColoringBookDetailsSection items={detailItems} /> : null}

          <ColoringBookNotesSection
            bookId={book.id}
            accountId={user?.id}
            notes={book.notes || ''}
            onSave={handleNotesSave}
            readOnly={updateBook.isPending}
          />
        </div>
        {editDrawerOpen ? (
          <ColoringBookEditDrawer
            key={`${user?.id ?? 'signed-out'}:${book.id}`}
            bookId={book.id}
            isOpen={editDrawerOpen}
            onOpenChange={setEditDrawerOpen}
          />
        ) : null}
      </section>
    </MainLayout>
  );
};

export default ColoringBookDetail;
