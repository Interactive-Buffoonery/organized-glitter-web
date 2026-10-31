import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import ColoringBookEditDrawer from '@/components/coloring/ColoringBookEditDrawer';
import { ColoringBookDetailActions } from '@/components/coloring/detail/ColoringBookDetailActions';
import { ColoringDetailUnavailable } from '@/components/coloring/detail/ColoringDetailUnavailable';
import { ColoringDetailRefreshNotice } from '@/components/coloring/detail/ColoringDetailRefreshNotice';
import { ColoringDetailRetryAnnouncements } from '@/components/coloring/detail/ColoringDetailRetryAnnouncements';
import { ColoringBookDetailsSection } from '@/components/coloring/detail/ColoringBookDetailsSection';
import type { ColoringBookMetadataItem } from '@/components/coloring/detail/coloringBookDetailData';
import { ColoringBookHero } from '@/components/coloring/detail/ColoringBookHero';
import { ColoringBookNotesSection } from '@/components/coloring/detail/ColoringBookNotesSection';
import { ColoringBookPagesSection } from '@/components/coloring/detail/ColoringBookPagesSection';
import { ColoringBookTagManager } from '@/components/coloring/ColoringBookTagManager';
import { ColoringBookDisclosure } from '@/components/coloring/detail/ColoringBookDisclosure';
import { SectionHeading } from '@/components/shared/Section';
import { notify } from '@/lib/notifications';
import { useAuth } from '@/hooks/useAuth';
import { hasSessionDraft } from '@/services/auth/sessionRecovery';
import { sessionDraftKeys } from '@/services/auth/sessionDraftKeys';
import { useBookIllustrators } from '@/hooks/queries/coloring/useBookIllustrators';
import { useBookPublishers } from '@/hooks/queries/coloring/useBookPublishers';
import { useColoringBook } from '@/hooks/queries/coloring/useColoringBook';
import { useColoringBookTags } from '@/hooks/queries/coloring/useColoringBookTags';
import {
  useColoringBookPages,
  useColoringBookPagePhotos,
} from '@/hooks/queries/coloring/useColoringBookPages';
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
  const pagesQuery = useColoringBookPages(id);
  const photosQuery = useColoringBookPagePhotos(id, user?.id);
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
  const pages = useMemo(() => pagesQuery.data ?? [], [pagesQuery.data]);
  const tags = book?.tags?.length ? book.tags : (tagsQuery.data ?? []);

  const completedPages = book?.completedPages ?? 0;
  const completionPct = book?.completionPercentage ?? 0;
  const safeCompletedPages = book ? Math.max(0, Math.min(completedPages, book.totalPages)) : 0;
  const safeCompletionPct = Math.max(0, Math.min(completionPct, 100));

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

  const publisherUrl = publishersQuery.data?.items.find(
    publisher => publisher.id === book.publisherId
  )?.website_url;
  const inProgressPages = pagesQuery.data
    ? pages.filter(page => page.status !== 'completed' && page.status !== 'not_started').length
    : undefined;
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

  return (
    <MainLayout>
      <ColoringDetailRetryAnnouncements
        primary={bookRetry.announcement}
        secondary={pagesRetry.announcement}
      />
      <section className="container mx-auto space-y-6 px-4 py-6 lg:py-8">
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

        <header className="lg:border-border/60 space-y-2 lg:border-b lg:pb-6">
          <h1 className="font-handwritten text-4xl leading-tight tracking-tight md:text-5xl">
            {book.title}
          </h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
            {publisherName &&
              (publisherUrl ? (
                <a
                  href={publisherUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground decoration-primary/50 inline-flex min-h-11 items-center underline decoration-2 underline-offset-4"
                >
                  {publisherName}
                </a>
              ) : (
                <span>{publisherName}</span>
              ))}
            {illustratorName && (
              <span>
                {publisherName ? '· ' : ''}Illustrated by {illustratorName}
              </span>
            )}
            {book.series && (
              <span>
                {publisherName || illustratorName ? '· ' : ''}
                {book.series}
              </span>
            )}
            {book.isMystery && (
              <span className="bg-primary/10 text-primary rounded-lg px-2 py-1 text-xs">
                Mystery
              </span>
            )}
          </div>
        </header>
        <div className="grid grid-cols-1 items-start gap-y-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-x-14">
          <div className="order-2 min-w-0 lg:order-1 lg:col-start-1 lg:row-start-1">
            {photosQuery.isError && (
              <ColoringDetailRefreshNotice
                kind="book"
                message="Could not load page progress photos. Page numbers are still available."
                retryable={ErrorHandler.handleError(photosQuery.error).retryable}
                onRetry={() => {
                  void photosQuery.refetch();
                }}
                isRetrying={photosQuery.isFetching}
              />
            )}
            <ColoringBookPagesSection
              key={book.id}
              book={book}
              pages={pages}
              latestPhotos={photosQuery.isError ? {} : photosQuery.data}
              isLoading={pagesQuery.isLoading}
              error={pagesQuery.error}
              hasLoadedData={Boolean(pagesQuery.data)}
              isFetching={pagesQuery.isFetching}
              isRetrying={pagesRetry.isRetrying}
              onRetry={retryPages}
              returnTo={dashboardPath}
            />
          </div>
          <aside className="contents lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:block lg:space-y-6">
            <div className="order-1 min-w-0">
              <ColoringBookHero
                book={book}
                coverUrl={coverUrl}
                safeCompletedPages={safeCompletedPages}
                safeCompletionPct={safeCompletionPct}
                inProgressPages={inProgressPages}
                updatePending={updateBook.isPending}
                onStatusChange={handleStatusChange}
              />
            </div>
            <div className="divide-border/60 lg:border-border/60 order-3 min-w-0 divide-y lg:space-y-6 lg:border-t lg:pt-6 [&>section+section]:lg:pt-6">
              <ColoringBookDisclosure
                title="About this book"
                summary={
                  [publisherName, illustratorName].filter(Boolean).join(' · ') || 'Add details'
                }
              >
                <ColoringBookDetailsSection
                  items={detailItems}
                  onEdit={() => setEditDrawerOpen(true)}
                />
              </ColoringBookDisclosure>
              <ColoringBookDisclosure
                title="Tags"
                summary={tags.map(tag => tag.name).join(', ') || 'No tags yet'}
              >
                <section className="space-y-3">
                  <SectionHeading>Tags</SectionHeading>
                  <ColoringBookTagManager
                    selectedTags={tags}
                    disabled={updateBook.isPending || syncBookTags.isPending}
                    onTagsChange={handleTagsChange}
                    withSection={false}
                    emptyText="No tags yet."
                  />
                </section>
              </ColoringBookDisclosure>
              <ColoringBookDisclosure title="Notes" summary={book.notes || 'No notes yet'}>
                <ColoringBookNotesSection
                  bookId={book.id}
                  accountId={user?.id}
                  notes={book.notes || ''}
                  onSave={handleNotesSave}
                  readOnly={updateBook.isPending}
                />
              </ColoringBookDisclosure>
            </div>
          </aside>
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
