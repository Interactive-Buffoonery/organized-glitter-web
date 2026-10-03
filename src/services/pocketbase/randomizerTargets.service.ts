import { getFileUrl, pb, resolveFileUrl } from '@/lib/pocketbase';
import {
  Collections,
  type ColoringBooksResponse,
  type ColoringPagesResponse,
  type ProjectsResponse,
} from '@/types/pocketbase.types';
import { COLORING_BOOK_STATUS_LABEL, COLORING_PAGE_STATUS_LABEL } from '@/utils/statusColors';
import { ErrorHandler } from './base/ErrorHandler';
import type { RandomizerEligibility, RandomizerMode, RandomizerTarget } from '@/types/randomizer';

type ExpandedName = { name?: string };

interface ColoringPageTargetOptions {
  bookId?: string;
}

type ExpandedProject = ProjectsResponse & {
  expand?: {
    company?: ExpandedName;
    artist?: ExpandedName;
  };
};

type ExpandedColoringBook = ColoringBooksResponse & {
  expand?: {
    publisher?: ExpandedName;
    illustrator?: ExpandedName;
  };
};

type ExpandedColoringPage = ColoringPagesResponse & {
  expand?: {
    book?: ExpandedColoringBook;
  };
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  wishlist: 'Wishlist',
  purchased: 'Purchased',
  stash: 'In stash',
  kitted: 'Kitted up',
  progress: 'In progress',
  onhold: 'On hold',
  completed: 'Completed',
  archived: 'Archived',
  destashed: 'Destashed',
};

const buildStatusFilter = (field: string, statuses: string[]): string => {
  if (statuses.length === 0) return 'id = "__none__"';

  const params = Object.fromEntries(statuses.map((status, index) => [`status${index}`, status]));
  const clauses = statuses.map((_, index) => `${field} = {:status${index}}`);

  return pb.filter(`(${clauses.join(' || ')})`, params);
};

function projectSubtitle(record: ExpandedProject): string {
  return [record.expand?.company?.name, record.expand?.artist?.name].filter(Boolean).join(' · ');
}

function bookSubtitle(record: ExpandedColoringBook): string {
  return [record.expand?.publisher?.name, record.expand?.illustrator?.name]
    .filter(Boolean)
    .join(' · ');
}

function pageSubtitle(record: ExpandedColoringPage): string {
  const book = record.expand?.book;
  const bookContext = book ? bookSubtitle(book) : '';
  const pieces = [book?.title, bookContext].filter(Boolean);
  return pieces.join(' · ');
}

function toDiamondTarget(record: ExpandedProject): RandomizerTarget {
  const subtitle = projectSubtitle(record);
  const imageUrl = record.image
    ? getFileUrl({ id: record.id, collectionName: Collections.Projects }, record.image, '600x400')
    : undefined;

  return {
    id: record.id,
    mode: 'diamond',
    targetType: 'diamond_project',
    title: record.title,
    subtitle,
    imageUrl,
    href: `/projects/${record.id}`,
    statusLabel: PROJECT_STATUS_LABELS[record.status] ?? record.status,
    width: record.width ?? undefined,
    height: record.height ?? undefined,
    totalDiamonds: record.total_diamonds ?? undefined,
    selectedMetadata: {
      project: record.id,
      company: record.expand?.company?.name ?? '',
      artist: record.expand?.artist?.name ?? '',
    },
  };
}

function toBookTarget(record: ExpandedColoringBook): RandomizerTarget {
  const subtitle = bookSubtitle(record);
  const imageUrl = record.cover_image
    ? resolveFileUrl(Collections.ColoringBooks, record.id, record.cover_image, '300x400')
    : undefined;

  return {
    id: record.id,
    mode: 'coloring-book',
    targetType: 'coloring_book',
    title: record.title,
    subtitle,
    imageUrl,
    href: `/coloring/${record.id}`,
    statusLabel: COLORING_BOOK_STATUS_LABEL[record.status],
    selectedMetadata: {
      coloringBook: record.id,
      publisher: record.expand?.publisher?.name ?? '',
      illustrator: record.expand?.illustrator?.name ?? '',
    },
  };
}

function toPageTarget(record: ExpandedColoringPage): RandomizerTarget {
  const book = record.expand?.book;
  const title = book ? `${book.title}, page ${record.page_number}` : `Page ${record.page_number}`;
  const [leadPhoto] = record.photos ?? [];
  const imageUrl = leadPhoto
    ? resolveFileUrl(Collections.ColoringPages, record.id, leadPhoto, '300x300')
    : book?.cover_image
      ? resolveFileUrl(Collections.ColoringBooks, book.id, book.cover_image, '300x400')
      : undefined;

  return {
    id: record.id,
    mode: 'coloring-page',
    targetType: 'coloring_page',
    title,
    subtitle: pageSubtitle(record),
    imageUrl,
    href: book ? `/coloring/${book.id}/pages/${record.id}` : `/coloring`,
    statusLabel: COLORING_PAGE_STATUS_LABEL[record.status],
    selectedMetadata: {
      coloringPage: record.id,
      coloringBook: book?.id ?? '',
      pageNumber: record.page_number,
    },
  };
}

export class RandomizerTargetsService {
  static async hasTargets(userId: string, mode: RandomizerMode): Promise<boolean> {
    return ErrorHandler.handleAsync(async () => {
      const collection =
        mode === 'diamond'
          ? Collections.Projects
          : mode === 'coloring-book'
            ? Collections.ColoringBooks
            : Collections.ColoringPages;
      const ownerField = mode === 'coloring-page' ? 'book.user' : 'user';
      const result = await pb.collection(collection).getList(1, 1, {
        filter: pb.filter(`${ownerField} = {:userId}`, { userId }),
        fields: 'id',
        skipTotal: true,
      });
      return result.items.length > 0;
    }, 'RandomizerTargets.hasTargets');
  }

  static async listDiamondTargets(
    userId: string,
    eligibility: RandomizerEligibility
  ): Promise<RandomizerTarget[]> {
    return ErrorHandler.handleAsync(async () => {
      const filter = [
        pb.filter('user = {:userId}', { userId }),
        buildStatusFilter('status', eligibility.diamondStatuses),
      ].join(' && ');

      const records = await pb.collection(Collections.Projects).getFullList<ExpandedProject>({
        filter,
        sort: '-updated',
        expand: 'company,artist',
      });

      return records.map(toDiamondTarget);
    }, 'RandomizerTargets.listDiamondTargets');
  }

  static async listColoringBookTargets(
    userId: string,
    eligibility: RandomizerEligibility
  ): Promise<RandomizerTarget[]> {
    return ErrorHandler.handleAsync(async () => {
      const filters = [
        pb.filter('user = {:userId}', { userId }),
        buildStatusFilter('status', eligibility.bookStatuses),
      ].filter(Boolean);

      const records = await pb
        .collection(Collections.ColoringBooks)
        .getFullList<ExpandedColoringBook>({
          filter: filters.join(' && '),
          sort: '-last_activity_at,-updated',
          expand: 'publisher,illustrator',
        });

      return records.map(toBookTarget);
    }, 'RandomizerTargets.listColoringBookTargets');
  }

  static async listColoringPageTargets(
    userId: string,
    eligibility: RandomizerEligibility,
    options: ColoringPageTargetOptions = {}
  ): Promise<RandomizerTarget[]> {
    return ErrorHandler.handleAsync(async () => {
      const filters = [
        pb.filter('book.user = {:userId}', { userId }),
        options.bookId ? pb.filter('book = {:bookId}', { bookId: options.bookId }) : '',
        buildStatusFilter('status', eligibility.pageStatuses),
      ].filter(Boolean);

      const records = await pb
        .collection(Collections.ColoringPages)
        .getFullList<ExpandedColoringPage>({
          filter: filters.join(' && '),
          sort: '-updated',
          expand: 'book,book.publisher,book.illustrator',
        });

      return records.map(toPageTarget);
    }, 'RandomizerTargets.listColoringPageTargets');
  }

  static async listTargets(
    userId: string,
    mode: RandomizerMode,
    eligibility: RandomizerEligibility
  ): Promise<RandomizerTarget[]> {
    if (mode === 'coloring-book') {
      return this.listColoringBookTargets(userId, eligibility);
    }

    if (mode === 'coloring-page') {
      return this.listColoringPageTargets(userId, eligibility);
    }

    return this.listDiamondTargets(userId, eligibility);
  }
}
