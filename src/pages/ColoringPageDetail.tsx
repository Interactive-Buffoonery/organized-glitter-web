import { useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ColoringPageCommandPanel } from '@/components/coloring/detail/page/ColoringPageCommandPanel';
import {
  ColoringPageDetailHeader,
  ColoringPageNavigation,
} from '@/components/coloring/detail/page/ColoringPageDetailHeader';
import { ColoringPagePhotoSection } from '@/components/coloring/detail/page/ColoringPagePhotoSection';
import { ColoringDetailUnavailable } from '@/components/coloring/detail/ColoringDetailUnavailable';
import { ColoringDetailRefreshNotice } from '@/components/coloring/detail/ColoringDetailRefreshNotice';
import { ColoringDetailRetryAnnouncements } from '@/components/coloring/detail/ColoringDetailRetryAnnouncements';
import { ColoringPageProgressNotes } from '@/components/coloring/ColoringPageProgressNotes';
import MainLayout from '@/components/layout/MainLayout';
import { useColoringPageCommandExecutor } from '@/hooks/coloring/useColoringPageCommandExecutor';
import { useColoringPageDetailData } from '@/hooks/coloring/useColoringPageDetailData';
import { useDetailRetryState } from '@/hooks/coloring/useDetailRetryState';
import { useColoringPageLifecycleDates } from '@/hooks/coloring/useColoringPageLifecycleDates';
import { useColoringPageMediumSelection } from '@/hooks/coloring/useColoringPageMediumSelection';
import { useColoringPageMysteryReveal } from '@/hooks/coloring/useColoringPageMysteryReveal';
import { useColoringPagePhotoManager } from '@/hooks/coloring/useColoringPagePhotoManager';
import { useColoringPageStatusAction } from '@/hooks/coloring/useColoringPageStatusAction';
import { useAppReady } from '@/hooks/useAppReady';
import { useAuth } from '@/hooks/useAuth';
import { usePageMetadata } from '@/hooks/usePageMetadata';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import {
  getColoringBookDetailPath,
  getColoringDashboardReturnPath,
} from './coloringBookNavigation';

const COLORING_DASHBOARD_PATH = '/dashboard?craft=coloring';

const ColoringPageDetail = () => {
  const { bookId, pageId } = useParams<{ bookId: string; pageId: string }>();
  const location = useLocation();
  const dashboardPath = getColoringDashboardReturnPath(
    new URLSearchParams(location.search).get('returnTo')
  );
  const { user } = useAuth();
  const {
    book,
    page,
    isLoading,
    error,
    retry,
    pagesError,
    pagesIsFetching,
    hasLoadedPages,
    retryPages,
    userTimezone,
    pagePhotoUrls,
    mediums,
    isMediumsLoading,
    previousPage,
    nextPage,
  } = useColoringPageDetailData({ bookId, pageId, userId: user?.id });
  const pageRetry = useDetailRetryState('coloring page', `${pageId}:${location.key}`);
  const pagesRetry = useDetailRetryState('page navigation', `${bookId}:${location.key}`);
  const [editOpen, setEditOpen] = useState(false);
  const [retryError, setRetryError] = useState<unknown>(null);
  const displayedError = error ?? (pageRetry.isRetrying ? retryError : null);
  const failure = displayedError ? ErrorHandler.handleError(displayedError) : null;
  const accessFailed = ErrorHandler.isAccessFailure(failure?.type);
  const retryPage = () => {
    setRetryError(error);
    void pageRetry.retry(retry);
  };
  const retryNavigation = () => {
    void pagesRetry.retry(retryPages);
  };

  // Dismiss splash on mount; page detail still uses in-app loading UI.
  useAppReady();
  usePageMetadata({
    title:
      page && book && !accessFailed
        ? `${page.revealedSubject.trim() || `Page ${page.pageNumber}`} in ${book.title || 'untitled coloring book'} | Organized Glitter`
        : isLoading
          ? 'Coloring page details | Organized Glitter'
          : failure && failure.type !== 'not_found'
            ? 'Coloring page unavailable | Organized Glitter'
            : 'Coloring page not found | Organized Glitter',
  });

  const commandExecutor = useColoringPageCommandExecutor();
  const statusAction = useColoringPageStatusAction(page, commandExecutor);
  const lifecycleDates = useColoringPageLifecycleDates(page, userTimezone, commandExecutor);
  const photoManager = useColoringPagePhotoManager(page, commandExecutor);
  const mediumSelection = useColoringPageMediumSelection(page, commandExecutor);
  const mysteryReveal = useColoringPageMysteryReveal(page, commandExecutor);

  if (isLoading && !pageRetry.isRetrying) {
    return (
      <MainLayout>
        <ColoringDetailRetryAnnouncements
          primary={pageRetry.announcement}
          secondary={pagesRetry.announcement}
          loadingText="Loading coloring page"
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

  if (!page || !book || accessFailed) {
    return (
      <MainLayout>
        <ColoringDetailRetryAnnouncements
          primary={pageRetry.announcement}
          secondary={pagesRetry.announcement}
        />
        <ColoringDetailUnavailable
          kind="page"
          error={displayedError}
          backPath={
            bookId ? getColoringBookDetailPath(bookId, dashboardPath) : COLORING_DASHBOARD_PATH
          }
          backLabel="Back to book"
          onRetry={retryPage}
          isRetrying={pageRetry.isRetrying}
        />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <ColoringDetailRetryAnnouncements
        primary={pageRetry.announcement}
        secondary={pagesRetry.announcement}
      />
      <section className="container mx-auto space-y-6 px-4 py-6 lg:py-8">
        <ColoringPageNavigation
          book={book}
          previousPage={previousPage}
          nextPage={nextPage}
          returnTo={dashboardPath}
          onEdit={() => setEditOpen(true)}
        />

        {failure && (
          <ColoringDetailRefreshNotice
            kind="page"
            retryable={failure.retryable}
            onRetry={retryPage}
            isRetrying={pageRetry.isRetrying}
          />
        )}

        {Boolean(pagesError) && (
          <ColoringDetailRefreshNotice
            kind="page"
            retryable={ErrorHandler.handleError(pagesError).retryable}
            message={
              hasLoadedPages
                ? 'Could not refresh page navigation. Showing the last loaded links.'
                : 'Could not load page navigation.'
            }
            onRetry={retryNavigation}
            isRetrying={pagesRetry.isRetrying || pagesIsFetching}
          />
        )}

        <div className="grid grid-cols-1 gap-y-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-x-14 lg:gap-y-8">
          <div className="order-2 lg:order-first lg:col-span-2">
            <ColoringPageDetailHeader book={book} page={page} returnTo={dashboardPath} />
          </div>
          <div className="order-1 -mx-4 min-w-0 lg:col-start-1 lg:row-start-2 lg:mx-0">
            <ColoringPagePhotoSection
              page={page}
              pagePhotoUrls={pagePhotoUrls}
              leadPhotoUrl={pagePhotoUrls[0]}
              disabled={photoManager.isPending}
              photoCropFile={photoManager.photoCropFile}
              isPhotoCropDialogOpen={photoManager.isPhotoCropDialogOpen}
              onPhotoUpload={photoManager.handlePhotoUpload}
              onPhotoCropDialogOpenChange={photoManager.handlePhotoCropDialogOpenChange}
              onPhotoCropComplete={photoManager.handlePhotoCropComplete}
              onPhotoUseOriginal={photoManager.handlePhotoUseOriginal}
              onSetMainPhoto={photoManager.setMainPhoto}
              onPhotoDelete={photoManager.deletePhoto}
            />
          </div>
          <div className="order-3 min-w-0 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:self-start">
            <ColoringPageCommandPanel
              page={page}
              book={book}
              mediums={mediums}
              isMediumsLoading={isMediumsLoading}
              userTimezone={userTimezone}
              statusAction={statusAction}
              lifecycleDates={lifecycleDates}
              mediumSelection={mediumSelection}
              mysteryReveal={mysteryReveal}
              returnTo={dashboardPath}
              editOpen={editOpen}
              onEditOpenChange={setEditOpen}
              onPhotos={() => {
                const manager = document.getElementById(
                  'page-photo-manager'
                ) as HTMLDetailsElement | null;
                if (manager) {
                  manager.open = true;
                  manager.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                if (!page.photos.length)
                  document
                    .querySelector<HTMLInputElement>('input[aria-label="Add page photos"]')
                    ?.click();
              }}
            />
          </div>
          <div className="order-4 min-w-0 lg:col-start-1 lg:row-start-3">
            <ColoringPageProgressNotes key={page.id} pageId={page.id} />
          </div>
        </div>
      </section>
    </MainLayout>
  );
};

export default ColoringPageDetail;
