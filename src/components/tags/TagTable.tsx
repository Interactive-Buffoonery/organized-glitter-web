/**
 * Tag Management Table Component
 * @author @serabi
 * @created 2025-01-09
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, FileText, Loader2 } from 'lucide-react';
import EditTagDialog from './EditTagDialog';
import { Link } from 'react-router-dom';
import type { Tag } from '@/types/tag';
import { useDeleteTag } from '@/hooks/mutations/useDeleteTag';
import { useDeleteColoringTag } from '@/hooks/mutations/coloring/useDeleteColoringTag';
import { useTagStats } from '@/hooks/queries/useTagStats';
import { useColoringTagStats } from '@/hooks/queries/coloring/useColoringTagStats';
import { formatProjectDate } from '@/utils/date/formatProjectDate';
import { logger } from '@/utils/logger';
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

/**
 * Props interface for the TagTable component
 */
interface TagTableProps {
  tags: Tag[];
  coloringTags?: Tag[];
  loading: boolean;
}

type TagVocabulary = 'diamond' | 'coloring';
const EMPTY_COLORING_TAGS: Tag[] = [];

type TagTableEntry = {
  tag: Tag;
  vocabulary: TagVocabulary;
};

const getDeleteDescription = ({ tag, vocabulary }: TagTableEntry) =>
  vocabulary === 'coloring'
    ? `This permanently deletes the coloring tag "${tag.name}". A tag that is still used by a coloring book cannot be deleted; remove it from those books first.`
    : `This permanently deletes the tag "${tag.name}". A tag that is still used by a diamond project cannot be deleted; remove it from those projects first.`;

/**
 * Skeleton component for the usage column while loading
 */
const ProjectCountSkeleton = () => (
  <div className="flex items-center gap-x-2">
    <Skeleton className="size-4 rounded" />
    <Skeleton className="h-4 w-16" />
  </div>
);

/**
 * Skeleton row for the entire table while loading
 */
const TagTableRowSkeleton = () => (
  <TableRow>
    <TableCell>
      <div className="flex items-center gap-2">
        <Skeleton className="size-3 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    </TableCell>
    <TableCell>
      <Skeleton className="h-4 w-24" />
    </TableCell>
    <TableCell>
      <div className="flex items-center gap-2">
        <Skeleton className="size-6 rounded border" />
        <Skeleton className="h-4 w-16" />
      </div>
    </TableCell>
    <TableCell>
      <ProjectCountSkeleton />
    </TableCell>
    <TableCell>
      <Skeleton className="h-4 w-20" />
    </TableCell>
    <TableCell>
      <div className="flex gap-x-1">
        <Skeleton className="size-8" />
        <Skeleton className="size-8" />
      </div>
    </TableCell>
  </TableRow>
);

interface UsageErrorAlertProps {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

const UsageErrorAlert = ({ message, retryLabel, onRetry }: UsageErrorAlertProps) => (
  <div
    className="border-border bg-muted/30 mb-3 flex items-center justify-between gap-3 rounded-md border px-3 py-2"
    role="alert"
  >
    <span className="text-muted-foreground text-sm">{message}</span>
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>
      {retryLabel}
    </Button>
  </div>
);

/**
 * TagTable Component
 *
 * Renders a data table displaying user tags with management functionality.
 * Features include project count display, editing capabilities, and secure deletion.
 */
const TagTable = ({ tags, coloringTags = EMPTY_COLORING_TAGS, loading }: TagTableProps) => {
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<TagTableEntry | null>(null);
  const deleteTagMutation = useDeleteTag();
  const deleteColoringTagMutation = useDeleteColoringTag();

  // Use the optimized tag stats hook with memoized tagIds
  const tagIds = useMemo(() => tags.map(tag => tag.id), [tags]);
  const coloringTagIds = useMemo(() => coloringTags.map(tag => tag.id), [coloringTags]);
  const rows = useMemo<TagTableEntry[]>(
    () => [
      ...tags.map(tag => ({ tag, vocabulary: 'diamond' as const })),
      ...coloringTags.map(tag => ({ tag, vocabulary: 'coloring' as const })),
    ],
    [coloringTags, tags]
  );
  const {
    data: projectCounts,
    isLoading: loadingCounts,
    error: statsError,
    refetch: refetchTagStats,
  } = useTagStats(tagIds);
  const {
    data: coloringBookCounts = {},
    isLoading: loadingColoringCounts,
    error: coloringStatsError,
    refetch: refetchColoringTagStats,
  } = useColoringTagStats(coloringTagIds);

  useEffect(() => {
    if (statsError) {
      logger.error('[TagTable] Tag stats error:', { statsError });
    }
  }, [statsError]);

  useEffect(() => {
    if (coloringStatsError) {
      logger.error('[TagTable] Coloring tag stats error:', { coloringStatsError });
    }
  }, [coloringStatsError]);

  const handleDeleteTag = useCallback((tag: Tag, vocabulary: TagVocabulary) => {
    setTagToDelete({ tag, vocabulary });
    setShowDeleteConfirmDialog(true);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setShowDeleteConfirmDialog(false);
    setTagToDelete(null);
  }, []);

  const confirmDeleteTag = useCallback(async () => {
    if (!tagToDelete) return;

    const onSettled = closeDeleteDialog;

    if (tagToDelete.vocabulary === 'diamond') {
      deleteTagMutation.mutate(
        { id: tagToDelete.tag.id, name: tagToDelete.tag.name },
        { onSettled }
      );
      return;
    }

    deleteColoringTagMutation.mutate(
      { id: tagToDelete.tag.id, name: tagToDelete.tag.name },
      { onSettled }
    );
  }, [closeDeleteDialog, deleteColoringTagMutation, deleteTagMutation, tagToDelete]);

  // Show skeleton loading for table structure while loading tags
  if (loading) {
    return (
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tag Name</TableHead>
              <TableHead>Vocabulary</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Created Date</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Show 5 skeleton rows while loading */}
            {Array.from({ length: 5 }).map((_, index) => (
              <TagTableRowSkeleton key={`skeleton-${index}`} />
            ))}
          </TableBody>
        </Table>
      </>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">You haven't created any tags yet.</p>
      </div>
    );
  }

  return (
    <>
      {statsError ? (
        <UsageErrorAlert
          message="Diamond project tag usage is unavailable."
          retryLabel="Retry diamond tag usage"
          onRetry={() => void refetchTagStats()}
        />
      ) : null}
      {coloringStatsError ? (
        <UsageErrorAlert
          message="Coloring book tag usage is unavailable."
          retryLabel="Retry coloring tag usage"
          onRetry={() => void refetchColoringTagStats()}
        />
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tag Name</TableHead>
            <TableHead>Vocabulary</TableHead>
            <TableHead>Color</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead>Created Date</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ tag, vocabulary }) => {
            const diamondProjectCount = projectCounts[tag.id] ?? 0;
            const coloringBookCount = coloringBookCounts[tag.id] ?? 0;
            const isUsageLoading = vocabulary === 'diamond' ? loadingCounts : loadingColoringCounts;
            const usageError = vocabulary === 'diamond' ? statsError : coloringStatsError;

            return (
              <TableRow key={`${vocabulary}-${tag.id}`}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <div className="size-3 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground text-sm">
                    {vocabulary === 'diamond' ? 'Diamond projects' : 'Coloring books'}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded border" style={{ backgroundColor: tag.color }} />
                    <span className="text-muted-foreground font-mono text-sm">
                      {tag.color.toUpperCase()}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {isUsageLoading ? (
                    <ProjectCountSkeleton />
                  ) : usageError ? (
                    <span className="text-muted-foreground text-sm">Unavailable</span>
                  ) : vocabulary === 'diamond' && diamondProjectCount > 0 ? (
                    <div className="flex flex-col items-start gap-1">
                      <Link
                        to={`/dashboard?tag=${encodeURIComponent(tag.id)}`}
                        className="text-link flex items-center transition-colors hover:underline"
                      >
                        <FileText className="mr-1 size-4" />
                        {diamondProjectCount}{' '}
                        {diamondProjectCount === 1 ? 'diamond project' : 'diamond projects'}
                      </Link>
                    </div>
                  ) : vocabulary === 'coloring' && coloringBookCount > 0 ? (
                    <div className="flex flex-col items-start gap-1">
                      <Link
                        to={`/dashboard?craft=coloring&tags=${encodeURIComponent(tag.id)}`}
                        className="text-link flex items-center transition-colors hover:underline"
                      >
                        <FileText className="mr-1 size-4" />
                        {coloringBookCount}{' '}
                        {coloringBookCount === 1 ? 'coloring book' : 'coloring books'}
                      </Link>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">No usage</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground text-sm">
                    {formatProjectDate(tag.createdAt)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-x-1">
                    {vocabulary === 'diamond' ? (
                      <>
                        <EditTagDialog tag={tag} />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTag(tag, vocabulary)}
                          className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">Delete {tag.name}</span>
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteTag(tag, vocabulary)}
                        className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Delete {tag.name}</span>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {tagToDelete && (
        <AlertDialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>{getDeleteDescription(tagToDelete)}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setTagToDelete(null);
                  setShowDeleteConfirmDialog(false);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteTag}
                disabled={
                  tagToDelete.vocabulary === 'coloring'
                    ? deleteColoringTagMutation.isPending
                    : deleteTagMutation.isPending
                }
              >
                {(tagToDelete.vocabulary === 'coloring'
                  ? deleteColoringTagMutation.isPending
                  : deleteTagMutation.isPending) && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
};

export default React.memo(TagTable);
