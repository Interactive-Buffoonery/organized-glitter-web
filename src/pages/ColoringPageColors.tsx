import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { ColoringDetailRetryAnnouncements } from '@/components/coloring/detail/ColoringDetailRetryAnnouncements';
import { ColoringDetailRefreshNotice } from '@/components/coloring/detail/ColoringDetailRefreshNotice';
import { ColoringDetailUnavailable } from '@/components/coloring/detail/ColoringDetailUnavailable';
import { ColorReferenceSection } from '@/components/coloring/detail/page/ColorReferenceSection';
import { ColorKeySection } from '@/components/coloring/detail/page/colorKeys/ColorKeySection';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { useColoringPageDetailData } from '@/hooks/coloring/useColoringPageDetailData';
import { useDetailRetryState } from '@/hooks/coloring/useDetailRetryState';
import { useAppReady } from '@/hooks/useAppReady';
import { useAuth } from '@/hooks/useAuth';
import { usePageMetadata } from '@/hooks/usePageMetadata';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import {
  getColoringBookDetailPath,
  getColoringDashboardReturnPath,
  getColoringPageDetailPath,
} from './coloringBookNavigation';

const ColoringPageColors = () => {
  const { bookId = '', pageId = '' } = useParams<{ bookId: string; pageId: string }>();
  const location = useLocation();
  const returnTo = getColoringDashboardReturnPath(
    new URLSearchParams(location.search).get('returnTo')
  );
  const { user } = useAuth();
  const { book, page, isLoading, error, retry } = useColoringPageDetailData({
    bookId,
    pageId,
    userId: user?.id,
  });
  const pageRetry = useDetailRetryState('coloring page', `${pageId}:${location.key}`);
  const [retryError, setRetryError] = useState<unknown>(null);
  const displayedError = error ?? (pageRetry.isRetrying ? retryError : null);
  const failure = displayedError ? ErrorHandler.handleError(displayedError) : null;
  const unavailable = !page || !book || ErrorHandler.isAccessFailure(failure?.type);
  const retryPage = () => {
    setRetryError(error);
    void pageRetry.retry(retry);
  };
  const announcements = (
    <ColoringDetailRetryAnnouncements primary={pageRetry.announcement} secondary="" />
  );

  useAppReady();
  usePageMetadata({
    title:
      page && book && !unavailable
        ? `Colors for page ${page.pageNumber} in ${book.title || 'untitled coloring book'} | Organized Glitter`
        : 'Coloring page colors | Organized Glitter',
  });

  if (isLoading && !pageRetry.isRetrying) {
    return (
      <MainLayout>
        <ColoringDetailRetryAnnouncements
          primary={pageRetry.announcement}
          secondary=""
          loadingText="Loading colors"
        />
        <div className="container mx-auto flex min-h-[50vh] items-center justify-center px-4">
          <Loader2 className="text-muted-foreground size-8 animate-spin" aria-hidden="true" />
        </div>
      </MainLayout>
    );
  }

  if (unavailable) {
    return (
      <MainLayout>
        {announcements}
        <ColoringDetailUnavailable
          kind="page"
          error={displayedError}
          backPath={getColoringBookDetailPath(bookId, returnTo)}
          backLabel="Back to book"
          isRetrying={pageRetry.isRetrying}
          onRetry={retryPage}
        />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {announcements}
      <section className="container mx-auto max-w-3xl space-y-6 px-4 py-6 lg:py-8">
        <Button asChild variant="ghost" size="sm">
          <Link to={getColoringPageDetailPath(book.id, page.id, returnTo)}>
            <ChevronLeft className="mr-2 size-4 shrink-0" aria-hidden="true" />
            Page {page.pageNumber}
          </Link>
        </Button>
        <header className="space-y-2">
          <h1 className="font-handwritten text-5xl leading-none tracking-tight md:text-6xl">
            Colors <span className="sr-only">for page {page.pageNumber}</span>
          </h1>
          <p className="text-muted-foreground text-sm">
            {book.title} / page {page.pageNumber}
          </p>
        </header>
        {failure ? (
          <ColoringDetailRefreshNotice
            kind="page"
            retryable={failure.retryable}
            onRetry={retryPage}
            isRetrying={pageRetry.isRetrying}
          />
        ) : null}
        <ColorReferenceSection pageId={page.id} />
        <ColorKeySection pageId={page.id} bookLabel={`${book.title}, page ${page.pageNumber}`} />
      </section>
    </MainLayout>
  );
};

export default ColoringPageColors;
