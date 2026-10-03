import {
  ProgressNotesService,
  type ProgressNoteListItem,
} from '@/services/pocketbase/progressNotes.service';
import {
  ColoringPageProgressNotesService,
  type ColoringPageProgressNoteListItem,
} from '@/services/pocketbase/coloringPageProgressNotes.service';
import type { MarkdownString } from '@/types/markdown';
import { Collections } from '@/types/pocketbase.types';
import type { NoteListCursor } from '@/services/pocketbase/base/noteListCursor';

const NOTES_FEED_PER_PAGE = 30;

export type NotesFeedCraft = 'diamond' | 'coloring';
type NotesFeedCraftFilter = 'all' | NotesFeedCraft;
export type NotesFeedTargetKey = `${NotesFeedCraft}:${string}`;

export interface NotesFeedListOptions {
  userId: string;
  page: number;
  perPage?: number;
  craft?: NotesFeedCraftFilter;
  sourceId?: string;
  projectId?: string;
  year?: number;
  hasImage?: boolean;
  continuation?: NotesFeedMergedContinuation;
}

interface NotesFeedLatestTarget {
  craft: NotesFeedCraft;
  id: string;
}

export interface NotesFeedLatestOptions {
  userId: string;
  targets: NotesFeedLatestTarget[];
}

interface NotesFeedSourceSummaryDTO {
  id: string;
  title: string;
  subtitle?: string;
  pageId?: string;
}

interface NotesFeedImageFileDTO {
  collectionName: typeof Collections.ProgressNotes | typeof Collections.ColoringPageProgressNotes;
  recordId: string;
  filename: string;
}

export interface NotesFeedItemDTO {
  id: string;
  craft: NotesFeedCraft;
  content: MarkdownString;
  date: string;
  createdAt: string;
  imageFile?: NotesFeedImageFileDTO;
  source: NotesFeedSourceSummaryDTO;
}

export interface NotesFeedPageResultDTO {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  totalsAreSnapshot: boolean;
  items: NotesFeedItemDTO[];
  nextContinuation?: NotesFeedMergedContinuation;
}

interface NotesFeedMergedSourceState {
  cursor?: NoteListCursor;
  buffer: NotesFeedItemDTO[];
  isExhausted: boolean;
  totalItems: number;
  hasLoaded: boolean;
}

export interface NotesFeedMergedContinuation {
  sources: Record<NotesFeedCraft, NotesFeedMergedSourceState>;
}

export interface NotesFeedLatestSummary {
  targetKey: NotesFeedTargetKey;
  date: string;
  createdAt: string;
}

interface NotesFeedSourcePageResult extends Omit<
  NotesFeedPageResultDTO,
  'totalsAreSnapshot' | 'nextContinuation'
> {
  sourceCursor?: NoteListCursor;
}

interface NotesFeedSourceAdapter {
  craft: NotesFeedCraft;
  listForUser(
    options: NotesFeedListOptions & { cursor?: NoteListCursor }
  ): Promise<NotesFeedSourcePageResult>;
  listLatestByTargetIds(
    userId: string,
    targetIds: string[]
  ): Promise<Record<NotesFeedTargetKey, NotesFeedLatestSummary>>;
}

const compareFeedItems = (a: NotesFeedItemDTO, b: NotesFeedItemDTO): number => {
  const dateCompare = b.date.localeCompare(a.date);
  if (dateCompare !== 0) return dateCompare;
  const createdCompare = b.createdAt.localeCompare(a.createdAt);
  if (createdCompare !== 0) return createdCompare;
  return b.id.localeCompare(a.id);
};

const sortFeedItems = (items: NotesFeedItemDTO[]): NotesFeedItemDTO[] =>
  [...items].sort(compareFeedItems);

const targetKeyFor = (craft: NotesFeedCraft, id: string): NotesFeedTargetKey => `${craft}:${id}`;

const toDiamondFeedItem = (note: ProgressNoteListItem): NotesFeedItemDTO => {
  const subtitle = [note.project?.company, note.project?.artist].filter(Boolean).join(' • ');
  const sourceId = note.project?.id ?? note.projectId;

  return {
    id: `diamond:${note.id}`,
    craft: 'diamond',
    content: note.content,
    date: note.date,
    createdAt: note.createdAt,
    imageFile: note.imageFilename
      ? {
          collectionName: Collections.ProgressNotes,
          recordId: note.id,
          filename: note.imageFilename,
        }
      : undefined,
    source: {
      id: sourceId,
      title: note.project?.title || 'Untitled diamond painting',
      subtitle: subtitle || undefined,
    },
  };
};

const toColoringFeedItem = (note: ColoringPageProgressNoteListItem): NotesFeedItemDTO => {
  const bookId = note.page?.bookId ?? note.pageId;
  const pageLabel = note.page?.pageNumber ? `Page ${note.page.pageNumber}` : undefined;
  const subtitle = [note.page?.publisher, note.page?.illustrator, pageLabel]
    .filter(Boolean)
    .join(' • ');

  return {
    id: `coloring:${note.id}`,
    craft: 'coloring',
    content: note.content,
    date: note.date,
    createdAt: note.createdAt,
    imageFile: note.imageFilename
      ? {
          collectionName: Collections.ColoringPageProgressNotes,
          recordId: note.id,
          filename: note.imageFilename,
        }
      : undefined,
    source: {
      id: bookId,
      title: note.page?.bookTitle || 'Untitled coloring book',
      subtitle: subtitle || undefined,
      pageId: note.pageId,
    },
  };
};

const diamondNotesFeedAdapter: NotesFeedSourceAdapter = {
  craft: 'diamond',
  async listForUser(options) {
    const result = await ProgressNotesService.listForUser({
      userId: options.userId,
      page: options.page,
      perPage: options.perPage ?? NOTES_FEED_PER_PAGE,
      projectId: options.projectId ?? options.sourceId,
      year: options.year,
      hasImage: options.hasImage,
      ...(options.cursor ? { cursor: options.cursor } : {}),
    });

    return {
      page: result.page,
      perPage: result.perPage,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      items: result.items.map(toDiamondFeedItem),
      sourceCursor: result.nextCursor,
    };
  },
  async listLatestByTargetIds(userId, targetIds) {
    const latestNotes = await ProgressNotesService.listLatestForProjects({
      userId,
      projectIds: targetIds,
    });

    return Object.entries(latestNotes).reduce<Record<NotesFeedTargetKey, NotesFeedLatestSummary>>(
      (summaries, [projectId, note]) => {
        const targetKey = targetKeyFor('diamond', projectId);
        summaries[targetKey] = {
          targetKey,
          date: note.date,
          createdAt: note.createdAt,
        };
        return summaries;
      },
      {}
    );
  },
};

const coloringNotesFeedAdapter: NotesFeedSourceAdapter = {
  craft: 'coloring',
  async listForUser(options) {
    const result = await ColoringPageProgressNotesService.listForUser({
      userId: options.userId,
      page: options.page,
      perPage: options.perPage ?? NOTES_FEED_PER_PAGE,
      sourceId: options.sourceId,
      year: options.year,
      hasImage: options.hasImage,
      ...(options.cursor ? { cursor: options.cursor } : {}),
    });

    return {
      page: result.page,
      perPage: result.perPage,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      items: result.items.map(toColoringFeedItem),
      sourceCursor: result.nextCursor,
    };
  },
  async listLatestByTargetIds(userId, targetIds) {
    const latestNotes = await ColoringPageProgressNotesService.listLatestForPages({
      userId,
      pageIds: targetIds,
    });

    return Object.entries(latestNotes).reduce<Record<NotesFeedTargetKey, NotesFeedLatestSummary>>(
      (summaries, [pageId, note]) => {
        const targetKey = targetKeyFor('coloring', pageId);
        summaries[targetKey] = {
          targetKey,
          date: note.date,
          createdAt: note.createdAt,
        };
        return summaries;
      },
      {}
    );
  },
};

const sourceAdapters = [diamondNotesFeedAdapter, coloringNotesFeedAdapter] as const;

const getAdaptersForCraft = (
  craft: NotesFeedCraftFilter = 'all'
): readonly NotesFeedSourceAdapter[] =>
  sourceAdapters.filter(adapter => craft === 'all' || adapter.craft === craft);

const emptyMergedSourceState = (): NotesFeedMergedSourceState => ({
  buffer: [],
  isExhausted: false,
  totalItems: 0,
  hasLoaded: false,
});

const cloneMergedSourceState = (
  state: NotesFeedMergedSourceState | undefined
): NotesFeedMergedSourceState =>
  state ? { ...state, buffer: [...state.buffer] } : emptyMergedSourceState();

const loadSourceBuffer = async (
  adapter: NotesFeedSourceAdapter,
  state: NotesFeedMergedSourceState,
  options: NotesFeedListOptions,
  batchSize: number
): Promise<NotesFeedMergedSourceState> => {
  const result = await adapter.listForUser({
    ...options,
    page: 1,
    perPage: batchSize,
    continuation: undefined,
    cursor: state.cursor,
  });

  return {
    cursor: result.sourceCursor ?? state.cursor,
    buffer: result.items,
    isExhausted: result.items.length < batchSize,
    totalItems: state.hasLoaded ? state.totalItems : result.totalItems,
    hasLoaded: true,
  };
};

const listMergedFeed = async (
  options: NotesFeedListOptions,
  adapters: readonly NotesFeedSourceAdapter[],
  perPage: number
): Promise<NotesFeedPageResultDTO> => {
  const batchSize = perPage + 1;
  const sources: Record<NotesFeedCraft, NotesFeedMergedSourceState> = {
    diamond: cloneMergedSourceState(options.continuation?.sources.diamond),
    coloring: cloneMergedSourceState(options.continuation?.sources.coloring),
  };
  const items: NotesFeedItemDTO[] = [];

  while (items.length < perPage) {
    const adaptersToLoad = adapters.filter(adapter => {
      const state = sources[adapter.craft];
      return state.buffer.length === 0 && !state.isExhausted;
    });
    const loadedStates = await Promise.all(
      adaptersToLoad.map(adapter =>
        loadSourceBuffer(adapter, sources[adapter.craft], options, batchSize)
      )
    );
    adaptersToLoad.forEach((adapter, index) => {
      sources[adapter.craft] = loadedStates[index];
    });

    const nextAdapter = adapters
      .filter(adapter => sources[adapter.craft].buffer.length > 0)
      .sort((a, b) => compareFeedItems(sources[a.craft].buffer[0], sources[b.craft].buffer[0]))[0];
    if (!nextAdapter) break;

    const nextItem = sources[nextAdapter.craft].buffer.shift();
    if (nextItem) items.push(nextItem);
  }

  const totalItems = adapters.reduce(
    (total, adapter) => total + sources[adapter.craft].totalItems,
    0
  );
  const hasMore = adapters.some(adapter => {
    const state = sources[adapter.craft];
    return state.buffer.length > 0 || !state.isExhausted;
  });

  return {
    page: options.page,
    perPage,
    totalItems,
    totalPages: Math.ceil(totalItems / perPage),
    totalsAreSnapshot: true,
    items,
    nextContinuation: hasMore ? { sources } : undefined,
  };
};

export class NotesFeedService {
  static async listForUser(options: NotesFeedListOptions): Promise<NotesFeedPageResultDTO> {
    const perPage = options.perPage ?? NOTES_FEED_PER_PAGE;
    const adapters = getAdaptersForCraft(options.craft);
    const isMergedFeed = adapters.length > 1;
    if (isMergedFeed) {
      return listMergedFeed(options, adapters, perPage);
    }

    const results = await Promise.all(
      adapters.map(adapter => adapter.listForUser({ ...options, page: options.page, perPage }))
    );

    const items = sortFeedItems(results.flatMap(result => result.items));
    const totalItems = results.reduce((sum, result) => sum + result.totalItems, 0);
    const totalPages = Math.ceil(totalItems / perPage);

    return {
      page: options.page,
      perPage,
      totalItems,
      totalPages,
      totalsAreSnapshot: false,
      items,
    };
  }

  static async listLatestByTargets(
    options: NotesFeedLatestOptions
  ): Promise<Record<NotesFeedTargetKey, NotesFeedLatestSummary>> {
    const targetsByCraft = options.targets.reduce<Record<NotesFeedCraft, string[]>>(
      (groupedTargets, target) => {
        groupedTargets[target.craft].push(target.id);
        return groupedTargets;
      },
      { diamond: [], coloring: [] }
    );

    const results = await Promise.all(
      sourceAdapters
        .filter(adapter => targetsByCraft[adapter.craft].length > 0)
        .map(adapter =>
          adapter.listLatestByTargetIds(options.userId, targetsByCraft[adapter.craft])
        )
    );

    return results.reduce<Record<NotesFeedTargetKey, NotesFeedLatestSummary>>(
      (summaries, result) => ({ ...summaries, ...result }),
      {}
    );
  }
}
