import { useMemo } from 'react';
import type { Project as ProjectType } from '@/types/project';
import type { DashboardValidSortField } from '@/features/dashboard/dashboard.constants';

export interface DividerPoint {
  /** Insert the divider before projects[insertBeforeIndex]. */
  insertBeforeIndex: number;
  /** Label rendered next to the divider line. */
  label: string;
  /** True for the trailing "no value" group (e.g. undated kits, no-company). */
  isTrailingGroup: boolean;
}

export interface SortDividerConfig {
  hasDividers: boolean;
  dividers: DividerPoint[];
}

const EMPTY_CONFIG: SortDividerConfig = { hasDividers: false, dividers: [] };

// Sort fields paired with the ProjectType key their group-by logic reads from.
// Only sorts with meaningful group boundaries appear here: kit_name,
// last_updated, and width are continuous/alphabetical and produce no dividers.
const DATE_FIELD_MAP = {
  date_purchased: { propertyKey: 'datePurchased', label: 'purchase date' },
  date_received: { propertyKey: 'dateReceived', label: 'received date' },
  date_started: { propertyKey: 'dateStarted', label: 'start date' },
  date_finished: { propertyKey: 'dateCompleted', label: 'finish date' },
} satisfies Record<string, { propertyKey: keyof ProjectType; label: string }>;

const STATUS_DISPLAY_NAMES: Record<string, string> = {
  wishlist: 'Wishlist',
  purchased: 'Purchased',
  stash: 'Stash',
  kitted: 'Kitted Up',
  progress: 'In Progress',
  onhold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
  destashed: 'Destashed',
};

/**
 * For a date-based sort, emit a single divider at the first project that
 * lacks a value for the sort's date field. Every project before this index
 * has a date; every project at and after has none.
 *
 * When the FIRST project on the page has no date, the whole page is part of
 * the undated group, emit the divider at index 0 as a continuation header
 * so users arriving on page 2+ know they're still in the "no date" group.
 *
 * Relies on the server returning undated projects last; see PR #209
 * (status_order / has_value sentinel columns) for the correctness guarantee.
 */
const buildDateDividers = (
  projects: ProjectType[],
  key: keyof ProjectType,
  friendlyName: string,
  totalUndatedCount: number | null
): DividerPoint[] => {
  const idx = projects.findIndex(project => !project[key]);
  if (idx === -1) return [];
  const undatedOnPage = projects.length - idx;

  // Three label formats depending on what's knowable and useful:
  //   - Multi-page group (total > on-page): "(18 total, 7 on this page)"
  //   - Total equals on-page (no other pages have undated): "(18 kits)"
  //   - Server count unavailable (defensive fallback): "(7 on this page)"
  let countLabel = '';
  if (totalUndatedCount !== null && totalUndatedCount !== undatedOnPage) {
    countLabel = ` (${totalUndatedCount} total, ${undatedOnPage} on this page)`;
  } else if (totalUndatedCount !== null) {
    countLabel = ` (${totalUndatedCount} ${totalUndatedCount === 1 ? 'kit' : 'kits'})`;
  } else {
    countLabel = ` (${undatedOnPage} on this page)`;
  }

  return [
    {
      insertBeforeIndex: idx,
      label: `Kits with no ${friendlyName}${countLabel}`,
      isTrailingGroup: true,
    },
  ];
};

/**
 * For any group-by sort, emit a divider wherever the group key changes
 * between consecutive projects, including at index 0. Rendering a divider
 * at the top of the first project is intentional: it labels the group the
 * user is currently looking at, which matters on page 2+ where the group
 * may have started on a prior page. It also makes page 1 unambiguous
 * ("I'm in the Dimensions group") without cluttering the UI.
 *
 * Trailing groups with empty/null keys receive a special "Kits with no X"
 * label via `emptyLabel`.
 */
const buildGroupDividers = <T extends string | null>(
  projects: ProjectType[],
  getKey: (project: ProjectType) => T | undefined,
  resolveLabel: (key: T | undefined) => string,
  emptyLabel: string
): DividerPoint[] => {
  const dividers: DividerPoint[] = [];
  let previousKey: T | undefined | symbol = Symbol('start'); // sentinel guaranteed to differ from any real key
  projects.forEach((project, index) => {
    const key = getKey(project);
    if (key === previousKey) return;
    const isEmpty = !key;
    dividers.push({
      insertBeforeIndex: index,
      label: isEmpty ? emptyLabel : resolveLabel(key),
      isTrailingGroup: isEmpty,
    });
    previousKey = key;
  });
  return dividers;
};

export interface UseSortDividersOptions {
  /**
   * Total count of projects without a value for the current date sort field,
   * computed server-side so it's accurate across pagination. Pass null if the
   * sort isn't date-based or the count isn't available yet.
   */
  totalUndatedCount?: number | null;
}

export const useSortDividers = (
  sortField: DashboardValidSortField,
  projects: ProjectType[],
  options: UseSortDividersOptions = {}
): SortDividerConfig => {
  const totalUndatedCount = options.totalUndatedCount ?? null;

  return useMemo(() => {
    if (!projects || projects.length === 0) return EMPTY_CONFIG;

    // Date-based sorts: single "kits with no X" divider at the transition.
    if (sortField in DATE_FIELD_MAP) {
      const config = DATE_FIELD_MAP[sortField as keyof typeof DATE_FIELD_MAP];
      const dividers = buildDateDividers(
        projects,
        config.propertyKey,
        config.label,
        totalUndatedCount
      );
      return dividers.length === 0 ? EMPTY_CONFIG : { hasDividers: true, dividers };
    }

    // Group-by sorts: divider at every group boundary.
    if (sortField === 'company') {
      const dividers = buildGroupDividers(
        projects,
        project => project.company ?? null,
        key => key ?? '',
        'Kits with no company'
      );
      return dividers.length === 0 ? EMPTY_CONFIG : { hasDividers: true, dividers };
    }

    if (sortField === 'artist') {
      const dividers = buildGroupDividers(
        projects,
        project => project.artist ?? null,
        key => key ?? '',
        'Kits with no artist'
      );
      return dividers.length === 0 ? EMPTY_CONFIG : { hasDividers: true, dividers };
    }

    if (sortField === 'status') {
      const dividers = buildGroupDividers(
        projects,
        project => project.status,
        key => STATUS_DISPLAY_NAMES[key ?? ''] ?? key ?? 'Unknown',
        'Unknown status'
      );
      return dividers.length === 0 ? EMPTY_CONFIG : { hasDividers: true, dividers };
    }

    // kit_name, last_updated, width → no meaningful group boundaries.
    return EMPTY_CONFIG;
  }, [sortField, projects, totalUndatedCount]);
};
