import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getFileUrl } from '@/lib/pocketbase';
import {
  NotesFeedService,
  type NotesFeedItemDTO,
  type NotesFeedMergedContinuation,
  type NotesFeedPageResultDTO,
} from '@/services/pocketbase/notesFeed.service';
import { queryKeys, type NotesFeedQueryParams } from './queryKeys';
import type { MarkdownString } from '@/types/markdown';

export type NotesFeedFilters = NotesFeedQueryParams;
type NotesFeedItemKind = 'diamond' | 'coloring';

export interface NotesFeedItem {
  id: string;
  kind: NotesFeedItemKind;
  content: MarkdownString;
  date: string;
  createdAt: string;
  imageUrl?: string;
  source: {
    id: string;
    title: string;
    subtitle?: string;
    detailUrl: string;
  };
  craftBadgeLabel: 'Diamond Painting' | 'Coloring Book';
}

export interface NotesFeedPageResult {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  totalsAreSnapshot: boolean;
  items: NotesFeedItem[];
  nextContinuation?: NotesFeedMergedContinuation;
}

interface NotesFeedPageParam {
  page: number;
  continuation?: NotesFeedMergedContinuation;
}

interface UseNotesFeedOptions {
  enabled?: boolean;
}

const getCraftBadgeLabel = (craft: NotesFeedItemKind) =>
  craft === 'diamond' ? 'Diamond Painting' : 'Coloring Book';

function toFeedItem(item: NotesFeedItemDTO): NotesFeedItem {
  const imageUrl = item.imageFile
    ? getFileUrl(
        { id: item.imageFile.recordId, collectionName: item.imageFile.collectionName },
        item.imageFile.filename
      )
    : undefined;

  return {
    id: item.id,
    kind: item.craft,
    content: item.content,
    date: item.date,
    createdAt: item.createdAt,
    imageUrl,
    source: {
      id: item.source.id,
      title: item.source.title,
      subtitle: item.source.subtitle,
      detailUrl:
        item.craft === 'diamond'
          ? `/projects/${item.source.id}`
          : `/coloring/${item.source.id}/pages/${item.source.pageId}`,
    },
    craftBadgeLabel: getCraftBadgeLabel(item.craft),
  };
}

async function fetchNotesFeedPage({
  userId,
  pageParam,
  filters,
}: {
  userId: string;
  pageParam: NotesFeedPageParam;
  filters: NotesFeedFilters;
}): Promise<NotesFeedPageResult> {
  const result: NotesFeedPageResultDTO = await NotesFeedService.listForUser({
    userId,
    page: pageParam.page,
    craft: filters.craft,
    sourceId: filters.sourceId,
    projectId: filters.projectId,
    year: filters.year,
    hasImage: filters.hasImage,
    ...(pageParam.continuation ? { continuation: pageParam.continuation } : {}),
  });

  return {
    page: result.page,
    perPage: result.perPage,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
    totalsAreSnapshot: result.totalsAreSnapshot,
    items: result.items.map(toFeedItem),
    nextContinuation: result.nextContinuation,
  };
}

export function useNotesFeed(filters: NotesFeedFilters = {}, options: UseNotesFeedOptions = {}) {
  const { user } = useAuth();
  const userId = user?.id;
  const { enabled = true } = options;
  const isMergedFeed = !filters.craft || filters.craft === 'all';

  return useInfiniteQuery<NotesFeedPageResult>({
    queryKey: queryKeys.notesFeed.list(userId || 'anonymous', filters),
    queryFn: ({ pageParam }) =>
      fetchNotesFeedPage({ userId: userId!, pageParam: pageParam as NotesFeedPageParam, filters }),
    enabled: !!userId && enabled,
    initialPageParam: { page: 1 },
    getNextPageParam: lastPage => {
      if (isMergedFeed) {
        return lastPage.nextContinuation
          ? { page: lastPage.page + 1, continuation: lastPage.nextContinuation }
          : undefined;
      }
      return lastPage.page < lastPage.totalPages ? { page: lastPage.page + 1 } : undefined;
    },
  });
}
