import { notify } from '@/lib/notifications';

/**
 * Tag List page component
 * @author @serabi
 * @created 2025-01-09
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';

import TagPageHeader from '@/components/tags/TagPageHeader';
import TagTable from '@/components/tags/TagTable';
import { Button } from '@/components/ui/button';
import { useMetadata } from '@/contexts/MetadataContext';
import { useAppReady } from '@/hooks/useAppReady';
import { useColoringTags } from '@/hooks/queries/coloring/useColoringTags';

/**
 * TagList Component
 *
 * Main page component for managing tags. Uses MetadataContext to access
 * cached tags data, preventing duplicate API calls.
 */
const TagList = () => {
  useAppReady();
  const { tags, isLoading, error } = useMetadata();
  const { data: coloringTags = [], isLoading: loadingColoringTags } = useColoringTags();
  const loading = isLoading.tags;

  // Handle errors from React Query - only fire toast when error state changes
  useEffect(() => {
    if (error.tags) {
      notify({ kind: 'error', title: 'Tags unavailable', description: 'Could not load tags' });
    }
  }, [error.tags]);

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

        <TagPageHeader />

        <div className="mt-6">
          <TagTable
            tags={tags}
            coloringTags={coloringTags}
            loading={loading || loadingColoringTags}
          />
        </div>
      </div>
    </MainLayout>
  );
};

export default TagList;
