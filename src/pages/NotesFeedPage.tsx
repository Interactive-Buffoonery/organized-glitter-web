import { useEffect, useMemo, useRef, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { AddNoteCTA } from '@/components/notes-feed/AddNoteCTA';
import { NotesFeedEmptyState } from '@/components/notes-feed/NotesFeedEmptyState';
import { NotesFeedFilters } from '@/components/notes-feed/NotesFeedFilters';
import { NotesTimeline } from '@/components/notes-feed/NotesTimeline';
import { groupItemsByMonth } from '@/components/notes-feed/groupItemsByMonth';
import type { ProgressNoteDialogTarget } from '@/components/projects/ProgressNoteDialog';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { useNotesFeed } from '@/hooks/queries/useNotesFeed';
import type { NotesFeedCraftFilter } from '@/hooks/queries/queryKeys';
import { useAppReady } from '@/hooks/useAppReady';
import { useAuth } from '@/hooks/useAuth';
import { useEnabledVerticals } from '@/hooks/useEnabledVerticals';

type NotesFeedTab = 'all' | 'diamond' | 'coloring';

function resolveVisibleTab(
  requestedTab: NotesFeedTab,
  canUseDiamond: boolean,
  canUseColoring: boolean
): NotesFeedTab {
  if (canUseDiamond && canUseColoring) return requestedTab;
  if (canUseDiamond) return 'diamond';
  if (canUseColoring) return 'coloring';
  return 'all';
}

/**
 * Loading placeholder shaped like the timeline it stands in for: one glass
 * surface, the rail, and entries of deliberately varied height (short, with
 * a photo, medium) so the skeleton mirrors that real notes differ in size.
 */
function NotesFeedSkeleton() {
  return (
    <GlassPanel className="p-4 sm:p-6 md:p-8">
      <div className="relative">
        <span
          aria-hidden="true"
          className="bg-border absolute top-1.5 bottom-1.5 left-[5px] w-px"
        />
        <div className="space-y-6">
          <div className="relative pl-7">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-1.5 h-4 w-3/5" />
          </div>
          <div className="relative pl-7">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-2 h-4 w-4/5" />
            <Skeleton className="mt-3 aspect-[4/3] w-full rounded-xl" />
          </div>
          <div className="relative pl-7">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-1.5 h-4 w-2/3" />
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

export default function NotesFeedPage() {
  const { user } = useAuth();
  const {
    diamond_painting: canUseDiamond,
    coloring_books: canUseColoring,
    isLoading: verticalsLoading,
  } = useEnabledVerticals(user?.id);
  useAppReady();
  const [activeTab, setActiveTab] = useState<NotesFeedTab>('all');
  const [year, setYear] = useState('all');
  const [sourceId, setSourceId] = useState('all');
  const visibleTab = resolveVisibleTab(activeTab, canUseDiamond, canUseColoring);
  const previousVisibleTab = useRef(visibleTab);
  const enabledVerticals = useMemo(
    () => ({
      diamond_painting: canUseDiamond,
      coloring_books: canUseColoring,
    }),
    [canUseColoring, canUseDiamond]
  );

  const handleCraftChange = (nextTab: NotesFeedTab) => {
    setActiveTab(nextTab);
    setSourceId('all');
  };

  // Only vertical-access tab coercion resets the source here; user tab changes reset in handleCraftChange.
  useEffect(() => {
    if (previousVisibleTab.current !== visibleTab && sourceId !== 'all') {
      setSourceId('all');
    }
    previousVisibleTab.current = visibleTab;
  }, [sourceId, visibleTab]);

  const filters = useMemo(() => {
    const craft: NotesFeedCraftFilter =
      visibleTab === 'diamond' || visibleTab === 'coloring' ? visibleTab : 'all';
    return {
      craft,
      year: year === 'all' ? undefined : Number(year),
      sourceId: sourceId === 'all' ? undefined : sourceId,
    };
  }, [sourceId, visibleTab, year]);

  const notesQuery = useNotesFeed(filters, { enabled: !verticalsLoading });
  const items = useMemo(
    () => notesQuery.data?.pages.flatMap(page => page.items) ?? [],
    [notesQuery.data?.pages]
  );
  const sortedItems = useMemo(
    () =>
      items.toSorted((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        const createdCompare = b.createdAt.localeCompare(a.createdAt);
        if (createdCompare !== 0) return createdCompare;
        return b.id.localeCompare(a.id);
      }),
    [items]
  );
  const monthGroups = useMemo(() => groupItemsByMonth(sortedItems), [sortedItems]);
  const sources = useMemo(() => {
    const sourceMap = new Map<string, { id: string; title: string }>();
    items.forEach(item => {
      sourceMap.set(item.source.id, { id: item.source.id, title: item.source.title });
    });
    return Array.from(sourceMap.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [items]);
  const directComposerTarget = useMemo<ProgressNoteDialogTarget | undefined>(() => {
    if (visibleTab !== 'diamond' || sourceId === 'all') return undefined;

    const selectedSource = sources.find(source => source.id === sourceId);
    if (!selectedSource) return undefined;

    return {
      kind: 'diamond-project',
      title: selectedSource.title,
      subtitle: 'Diamond painting',
      thumbnailUrl: null,
    };
  }, [sourceId, sources, visibleTab]);

  return (
    <MainLayout currentPage="Notes">
      <div className="container mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <header className="mb-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="font-handwritten text-4xl leading-none tracking-tight md:text-5xl">
              Notes
            </h1>
            <AddNoteCTA
              visibleTab={visibleTab}
              sourceId={sourceId}
              verticals={enabledVerticals}
              target={directComposerTarget}
            />
          </div>
          <NotesFeedFilters
            craft={visibleTab}
            canUseDiamond={canUseDiamond}
            canUseColoring={canUseColoring}
            year={year}
            sourceId={sourceId}
            sources={sources}
            onCraftChange={handleCraftChange}
            onYearChange={setYear}
            onSourceChange={setSourceId}
          />
        </header>

        {verticalsLoading || notesQuery.isLoading ? (
          <NotesFeedSkeleton />
        ) : notesQuery.isError ? (
          <GlassPanel className="space-y-4 p-6 text-center">
            <h2 className="text-lg font-semibold">Notes are unavailable</h2>
            <p className="text-muted-foreground text-sm">Try again in a moment.</p>
            <Button type="button" variant="ghost" onClick={() => notesQuery.refetch()}>
              Retry
            </Button>
          </GlassPanel>
        ) : items.length === 0 ? (
          <NotesFeedEmptyState craft={visibleTab} />
        ) : (
          <GlassPanel className="p-4 sm:p-6 md:p-8">
            <NotesTimeline groups={monthGroups} />
            {notesQuery.hasNextPage ? (
              <div className="border-border/60 mt-8 flex justify-center border-t pt-6">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => notesQuery.fetchNextPage()}
                  disabled={notesQuery.isFetchingNextPage}
                >
                  {notesQuery.isFetchingNextPage ? 'Loading' : 'Load more notes'}
                </Button>
              </div>
            ) : null}
          </GlassPanel>
        )}
      </div>
    </MainLayout>
  );
}
