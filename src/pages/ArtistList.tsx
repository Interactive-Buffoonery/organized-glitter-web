import { notify } from '@/lib/notifications';

/**
 * Artist List page component
 * @author @serabi
 * @created 2025-01-09
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';

import { useArtists } from '@/hooks/queries/useArtists';
import ArtistPageHeader from '@/components/artist/ArtistPageHeader';
import ArtistTable from '@/components/artist/ArtistTable';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/utils/logger';
import { useAppReady } from '@/hooks/useAppReady';

const logger = createLogger('ArtistList');
/**
 * ArtistList Component
 *
 * Main page component for managing artists. Displays a list of artists
 * with the ability to add, edit, and delete artists.
 */
const ArtistList = () => {
  const { data: artists = [], isLoading: loading, error } = useArtists();
  useAppReady();

  // Performance validation logging
  useEffect(() => {
    const pageLoadStart = performance.now();
    logger.debug('ArtistList page component mounted', {
      timestamp: new Date().toISOString(),
      artistsCount: artists.length,
      isLoading: loading,
      hasError: !!error,
    });

    return () => {
      const pageLoadEnd = performance.now();
      logger.debug('ArtistList page component unmounted', {
        duration: Math.round(pageLoadEnd - pageLoadStart),
        timestamp: new Date().toISOString(),
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only effect capturing initial state values
  }, []);

  // Log when artists data changes
  useEffect(() => {
    if (artists.length > 0) {
      logger.debug('Artists data loaded successfully', {
        artistsCount: artists.length,
        isLoading: loading,
        timestamp: new Date().toISOString(),
      });
    }
  }, [artists.length, loading, error]);

  // Handle errors from React Query
  useEffect(() => {
    if (error) {
      logger.error('Artists loading error:', error);
      notify({
        kind: 'error',
        title: 'Artists unavailable',
        description: 'Could not load artists',
      });
    }
  }, [error]);

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1.5 pointer-coarse:min-h-11"
          >
            <Link to="/options">
              <ChevronLeft className="size-4" />
              Back to Manage Lists
            </Link>
          </Button>
        </div>

        <ArtistPageHeader artists={artists} />
        <div className="mt-6">
          <ArtistTable artists={artists} loading={loading} />
        </div>
      </div>
    </MainLayout>
  );
};

export default ArtistList;
