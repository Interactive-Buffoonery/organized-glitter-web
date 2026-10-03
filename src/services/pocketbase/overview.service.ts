import { pb, resolveFileUrl } from '@/lib/pocketbase';
import {
  Collections,
  ColoringPagesStatusOptions,
  type ColoringBooksResponse,
  type ColoringPagesResponse,
  type ProjectsResponse,
  ProjectsStatusOptions,
} from '@/types/pocketbase.types';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import {
  NotesFeedService,
  type NotesFeedCraft,
  type NotesFeedTargetKey,
} from '@/services/pocketbase/notesFeed.service';
import type { VerticalToggles } from '@/services/pocketbase/dashboardSettings.service';
import { toExpandedProject } from '@/services/pocketbase/projectMappers';

export type OverviewCraftFilter = 'all' | 'diamond' | 'coloring';

type OverviewItemKind = 'diamond-project' | 'coloring-page';

export type OverviewStatusTone = 'progress' | 'kitted' | 'started' | 'muted';

export interface OverviewFeedItem {
  id: string;
  key: string;
  kind: OverviewItemKind;
  craft: Exclude<OverviewCraftFilter, 'all'>;
  title: string;
  subtitle: string;
  thumbnailUrl: string | null;
  statusLabel: string;
  statusTone: OverviewStatusTone;
  activityLabel: string;
  href: string;
  sortAt: string;
  sortTitle: string;
}

export interface OverviewSnapshot {
  diamondActiveCount: number;
  coloringPageInProgressCount: number;
  completedThisMonthCount: number;
}

export interface OverviewData {
  generatedAt: string;
  items: OverviewFeedItem[];
  snapshot: OverviewSnapshot;
}

export interface NoteTarget {
  id: string;
  kind: OverviewItemKind;
  craft: Exclude<OverviewCraftFilter, 'all'>;
  title: string;
  subtitle: string;
  thumbnailUrl: string | null;
  updatedAt: string;
}

type ExpandedColoringBookRecord = ColoringBooksResponse & {
  expand?: {
    publisher?: { name?: string };
    illustrator?: { name?: string };
  };
};

type ExpandedColoringPageRecord = ColoringPagesResponse & {
  expand?: {
    book?: ExpandedColoringBookRecord;
  };
};

const EMPTY_OVERVIEW_DATA: OverviewData = {
  generatedAt: '',
  items: [],
  snapshot: {
    diamondActiveCount: 0,
    coloringPageInProgressCount: 0,
    completedThisMonthCount: 0,
  },
};

const MIN_NOTE_TARGET_SEARCH_LENGTH = 2;
const PROJECT_NOTE_TARGET_FIELDS =
  'id,user,title,image,updated,created,status,company,artist,expand.company.name,expand.artist.name';
const PAGE_NOTE_TARGET_EXPAND = 'book,book.publisher,book.illustrator';
const MONTH_DAY_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

const formatMonthDay = (value: string): string => {
  const localDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = localDateOnly ? new Date(`${value}T00:00:00`) : new Date(value);
  return MONTH_DAY_FORMATTER.format(date);
};

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCurrentMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    start: formatLocalDate(start),
    end: formatLocalDate(end),
  };
};

const getProjectSubtitle = (company?: string, artist?: string) => {
  const detail = [company, artist].filter(Boolean).join(' · ');
  return detail ? `Diamond painting · ${detail}` : 'Diamond painting';
};

const getBookCoverUrl = (book: Pick<ColoringBooksResponse, 'id' | 'cover_image'>): string | null =>
  book.cover_image
    ? resolveFileUrl(Collections.ColoringBooks, book.id, book.cover_image, '160x220')
    : null;

const getPageThumbnailUrl = (page: ExpandedColoringPageRecord): string | null => {
  const firstPhoto = page.photos?.[0];
  if (firstPhoto) {
    return resolveFileUrl(Collections.ColoringPages, page.id, firstPhoto, '160x160');
  }
  return page.expand?.book ? getBookCoverUrl(page.expand.book) : null;
};

const normalizeNoteTargetSearchTerm = (searchTerm?: string): string => {
  const trimmed = searchTerm?.trim() ?? '';
  return trimmed.length >= MIN_NOTE_TARGET_SEARCH_LENGTH ? trimmed : '';
};

const toContainsSearchTerm = (searchTerm: string): string =>
  searchTerm.includes('%') || searchTerm.includes('_') ? searchTerm : `%${searchTerm}%`;

const extractPageNumberSearch = (searchTerm: string): number | null => {
  const match = searchTerm.match(/\d+/);
  if (!match) return null;

  const value = Number(match[0]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

const buildProjectNoteTargetFilter = (userId: string, searchTerm: string): string => {
  if (!searchTerm) {
    return pb.filter('user = {:userId} && status = {:status}', {
      userId,
      status: ProjectsStatusOptions.progress,
    });
  }

  const term = toContainsSearchTerm(searchTerm);
  const ownershipAndStatus = pb.filter(
    'user = {:userId} && status != {:archived} && status != {:destashed}',
    {
      userId,
      archived: ProjectsStatusOptions.archived,
      destashed: ProjectsStatusOptions.destashed,
    }
  );
  const searchConditions = [
    pb.filter('title ~ {:term}', { term }),
    pb.filter('company.name ~ {:term}', { term }),
    pb.filter('artist.name ~ {:term}', { term }),
  ];

  return `${ownershipAndStatus} && (${searchConditions.join(' || ')})`;
};

const buildPageNoteTargetFilter = (userId: string, searchTerm: string): string => {
  if (!searchTerm) {
    return pb.filter('book.user = {:userId} && status = {:status}', {
      userId,
      status: ColoringPagesStatusOptions.in_progress,
    });
  }

  const term = toContainsSearchTerm(searchTerm);
  const pageNumber = extractPageNumberSearch(searchTerm);
  const searchConditions = [
    pb.filter('book.title ~ {:term}', { term }),
    pb.filter('revealed_subject ~ {:term}', { term }),
  ];

  if (pageNumber !== null) {
    searchConditions.push(pb.filter('page_number = {:pageNumber}', { pageNumber }));
  }

  return `${pb.filter('book.user = {:userId}', { userId })} && (${searchConditions.join(' || ')})`;
};

const mapProjectToNoteTarget = (record: ProjectsResponse): NoteTarget => {
  const project = toExpandedProject(record);
  return {
    id: project.id,
    kind: 'diamond-project',
    craft: 'diamond',
    title: project.title,
    subtitle: getProjectSubtitle(project.company, project.artist),
    thumbnailUrl: project.imageUrl
      ? resolveFileUrl(Collections.Projects, project.id, project.imageUrl, '600x400')
      : null,
    updatedAt: project.updatedAt,
  };
};

const mapPageToNoteTarget = (page: ExpandedColoringPageRecord): NoteTarget => {
  const book = page.expand?.book;
  return {
    id: page.id,
    kind: 'coloring-page',
    craft: 'coloring',
    title: `Page ${page.page_number}`,
    subtitle: book?.title ? `Coloring · ${book.title}` : 'Coloring',
    thumbnailUrl: getPageThumbnailUrl(page),
    updatedAt: page.updated,
  };
};

const toNotesFeedTargetKey = (craft: NotesFeedCraft, id: string): NotesFeedTargetKey =>
  `${craft}:${id}`;

export class OverviewService {
  static empty(): OverviewData {
    return {
      ...EMPTY_OVERVIEW_DATA,
      generatedAt: new Date().toISOString(),
    };
  }

  static async getNoteTargets(
    userId: string,
    options: { searchTerm?: string; verticals?: VerticalToggles } = {}
  ): Promise<NoteTarget[]> {
    if (!userId) {
      return [];
    }

    const searchTerm = normalizeNoteTargetSearchTerm(options.searchTerm);
    const canUseDiamond = options.verticals?.diamond_painting ?? true;
    const canUseColoring = options.verticals?.coloring_books ?? true;

    return ErrorHandler.handleAsync(async () => {
      const [projectRecords, pageRecords] = await Promise.all([
        canUseDiamond
          ? pb.collection(Collections.Projects).getFullList<ProjectsResponse>({
              filter: buildProjectNoteTargetFilter(userId, searchTerm),
              fields: PROJECT_NOTE_TARGET_FIELDS,
              sort: '-updated',
              expand: 'company,artist',
              requestKey: null,
            })
          : Promise.resolve([] as ProjectsResponse[]),
        canUseColoring
          ? pb.collection(Collections.ColoringPages).getFullList<ExpandedColoringPageRecord>({
              filter: buildPageNoteTargetFilter(userId, searchTerm),
              sort: '-updated',
              expand: PAGE_NOTE_TARGET_EXPAND,
              requestKey: null,
            })
          : Promise.resolve([] as ExpandedColoringPageRecord[]),
      ]);

      return [
        ...projectRecords.map(mapProjectToNoteTarget),
        ...pageRecords.map(mapPageToNoteTarget),
      ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }, 'Overview.getNoteTargets');
  }

  static async getPagesForBook(userId: string, bookId: string): Promise<NoteTarget[]> {
    if (!userId || !bookId) {
      return [];
    }

    return ErrorHandler.handleAsync(async () => {
      const pages = await pb
        .collection(Collections.ColoringPages)
        .getFullList<ExpandedColoringPageRecord>({
          filter: pb.filter('book.user = {:userId} && book = {:bookId}', { userId, bookId }),
          sort: 'page_number',
          expand: PAGE_NOTE_TARGET_EXPAND,
          requestKey: null,
        });

      return pages.map(mapPageToNoteTarget);
    }, 'Overview.getPagesForBook');
  }

  static async getOverviewData(userId: string, verticals?: VerticalToggles): Promise<OverviewData> {
    if (!userId) {
      return this.empty();
    }

    return ErrorHandler.handleAsync(async () => {
      const canUseDiamond = verticals?.diamond_painting ?? true;
      const canUseColoring = verticals?.coloring_books ?? true;
      const monthRange = getCurrentMonthRange();
      const activeProjectFilter = pb.filter('user = {:userId} && status = {:progress}', {
        userId,
        progress: 'progress',
      });
      const activePagesFilter = pb.filter('book.user = {:userId} && status = {:status}', {
        userId,
        status: ColoringPagesStatusOptions.in_progress,
      });

      const [projectRecords, activePages, completedProjects, completedPages] = await Promise.all([
        canUseDiamond
          ? pb.collection(Collections.Projects).getFullList<ProjectsResponse>({
              filter: activeProjectFilter,
              fields:
                'id,user,title,image,updated,created,status,company,artist,expand.company.name,expand.artist.name',
              sort: '-updated',
              expand: 'company,artist',
              requestKey: null,
            })
          : Promise.resolve([]),
        canUseColoring
          ? pb.collection(Collections.ColoringPages).getFullList<ExpandedColoringPageRecord>({
              filter: activePagesFilter,
              sort: '-updated',
              expand: 'book,book.publisher,book.illustrator',
              requestKey: null,
            })
          : Promise.resolve([]),
        canUseDiamond
          ? pb.collection(Collections.Projects).getList(1, 1, {
              filter: pb.filter(
                'user = {:userId} && status = {:status} && date_completed >= {:start} && date_completed < {:end}',
                {
                  userId,
                  status: 'completed',
                  start: monthRange.start,
                  end: monthRange.end,
                }
              ),
              fields: 'id',
            })
          : Promise.resolve({ totalItems: 0 }),
        canUseColoring
          ? pb.collection(Collections.ColoringPages).getList(1, 1, {
              filter: pb.filter(
                'book.user = {:userId} && status = {:status} && completed_at >= {:start} && completed_at < {:end}',
                {
                  userId,
                  status: ColoringPagesStatusOptions.completed,
                  start: monthRange.start,
                  end: monthRange.end,
                }
              ),
              fields: 'id',
            })
          : Promise.resolve({ totalItems: 0 }),
      ]);

      const projects = projectRecords.map(record => toExpandedProject(record));
      const latestNotesByTarget = await NotesFeedService.listLatestByTargets({
        userId,
        targets: [
          ...projects.map(project => ({ craft: 'diamond' as const, id: project.id })),
          ...activePages.map(page => ({ craft: 'coloring' as const, id: page.id })),
        ],
      });

      const diamondItems: OverviewFeedItem[] = projects.map(project => {
        const latestNote = latestNotesByTarget[toNotesFeedTargetKey('diamond', project.id)];
        return {
          id: project.id,
          key: `diamond-project-${project.id}`,
          kind: 'diamond-project',
          craft: 'diamond',
          title: project.title,
          subtitle: getProjectSubtitle(project.company, project.artist),
          thumbnailUrl: project.imageUrl
            ? resolveFileUrl(Collections.Projects, project.id, project.imageUrl, '600x400')
            : null,
          statusLabel: 'In progress',
          statusTone: 'progress',
          activityLabel: latestNote
            ? `Last progress note ${formatMonthDay(latestNote.date)}`
            : 'No progress notes yet',
          href: `/projects/${project.id}`,
          sortAt: latestNote?.date || project.updatedAt,
          sortTitle: project.title,
        };
      });

      const pageItems: OverviewFeedItem[] = activePages.map(page => {
        const book = page.expand?.book;
        const latestNote = latestNotesByTarget[toNotesFeedTargetKey('coloring', page.id)];
        return {
          id: page.id,
          key: `coloring-page-${page.id}`,
          kind: 'coloring-page',
          craft: 'coloring',
          title: `Page ${page.page_number}`,
          subtitle: book?.title ? `Coloring · ${book.title}` : 'Coloring',
          thumbnailUrl: getPageThumbnailUrl(page),
          statusLabel: 'In progress',
          statusTone: 'progress',
          activityLabel: latestNote
            ? `Last progress note ${formatMonthDay(latestNote.date)}`
            : 'No progress notes yet',
          href: `/coloring/${page.book}/pages/${page.id}`,
          sortAt: latestNote?.date || page.updated,
          sortTitle: `${book?.title ?? 'Coloring'} ${page.page_number}`,
        };
      });

      const items = [...diamondItems, ...pageItems].sort(
        (a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime()
      );

      return {
        generatedAt: new Date().toISOString(),
        items,
        snapshot: {
          diamondActiveCount: projects.length,
          coloringPageInProgressCount: activePages.length,
          completedThisMonthCount: completedProjects.totalItems + completedPages.totalItems,
        },
      };
    }, 'Overview.getOverviewData');
  }
}
