import { notify } from '@/lib/notifications';

/**
 * Tag List page component
 * @author @serabi
 * @created 2025-01-09
 */

import { useEffect } from 'react';
import { ManageListsLayout } from '@/components/manage-lists/ManageListsLayout';
import { Button } from '@/components/ui/button';

import TagPageHeader from '@/components/tags/TagPageHeader';
import TagTable from '@/components/tags/TagTable';
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
  const {
    data: coloringTags = [],
    isLoading: loadingColoringTags,
    isPending: pendingColoringTags,
    fetchStatus: coloringTagsFetchStatus,
    error: coloringTagsError,
    errorUpdatedAt: coloringTagsErrorUpdatedAt,
    refetch: refetchColoringTags,
  } = useColoringTags();
  const loading = isLoading.tags;
  const hasTags = tags.length > 0 || coloringTags.length > 0;
  const showColoringRecovery =
    Boolean(coloringTagsError) || (pendingColoringTags && coloringTagsErrorUpdatedAt > 0);
  const busyColoringTags = coloringTagsFetchStatus !== 'idle';
  const coloringRetryLabel =
    coloringTagsFetchStatus === 'paused'
      ? 'Waiting for connection'
      : busyColoringTags
        ? 'Retrying coloring tags'
        : 'Retry coloring tags';

  // Handle errors from React Query - only fire toast when error state changes
  useEffect(() => {
    if (error.tags) {
      notify({ kind: 'error', title: 'Tags unavailable', description: 'Could not load tags' });
    }
  }, [error.tags]);

  return (
    <ManageListsLayout>
      <TagPageHeader />

      <div className="mt-6">
        {showColoringRecovery && (
          <div
            className="border-border bg-muted/30 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
            role="alert"
          >
            <span className="text-muted-foreground text-sm">
              {coloringTagsFetchStatus === 'paused'
                ? 'Waiting for connection...'
                : busyColoringTags
                  ? 'Retrying coloring tags...'
                  : 'Could not load coloring tags.'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-disabled={busyColoringTags}
              className="aria-disabled:opacity-50"
              onClick={() => {
                if (!busyColoringTags) void refetchColoringTags();
              }}
              aria-label={coloringRetryLabel}
            >
              {busyColoringTags ? 'Retrying...' : 'Retry'}
            </Button>
          </div>
        )}
        {loadingColoringTags && !showColoringRecovery && (
          <p role="status" className="text-muted-foreground mb-3 text-sm">
            Loading coloring tags...
          </p>
        )}
        {(!showColoringRecovery || hasTags || loading) && (
          <TagTable
            tags={tags}
            coloringTags={coloringTags}
            loading={loading || (loadingColoringTags && !hasTags)}
          />
        )}
      </div>
    </ManageListsLayout>
  );
};

export default TagList;
