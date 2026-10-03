import { getActiveFilterCount, type FilterState } from '@/contexts/FilterContext/types';

export type NamedOption = {
  id: string;
  name: string;
};

export interface DashboardEmptyState {
  title: string;
  description: string;
  isUnfiltered: boolean;
}

const STATUS_SUBJECTS: Record<FilterState['activeStatus'], string> = {
  everything: 'projects',
  wishlist: 'wishlist kits',
  purchased: 'purchased kits',
  stash: 'stash kits',
  kitted: 'kitted-up kits',
  progress: 'in-progress kits',
  onhold: 'on-hold kits',
  completed: 'completed kits',
  destashed: 'destashed kits',
  archived: 'archived kits',
};

const STATUS_ONLY_DESCRIPTIONS: Partial<Record<FilterState['activeStatus'], string>> = {
  kitted: 'No kits currently kitted up and not started!',
};

const resolveName = (options: NamedOption[], id: string, fallbackLabel: string): string => {
  return options.find(option => option.id === id)?.name || fallbackLabel;
};

const formatReasonList = (reasons: string[]): string => {
  if (reasons.length <= 2) {
    return reasons.join(' + ');
  }

  const extraCount = reasons.length - 2;
  const extraLabel = extraCount === 1 ? '1 more filter' : `${extraCount} more filters`;
  return `${reasons.slice(0, 2).join(' + ')} + ${extraLabel}`;
};

const buildReasonParts = (
  filters: FilterState,
  metadata: {
    companies: NamedOption[];
    artists: NamedOption[];
    tags: NamedOption[];
  }
): string[] => {
  const reasons: string[] = [];

  if (filters.searchTerm.trim()) {
    const quotedTerm = `“${filters.searchTerm.trim()}”`;
    reasons.push(filters.searchAllFields ? `${quotedTerm} in all fields` : quotedTerm);
  }

  if (filters.selectedTags.length === 1) {
    reasons.push(`tag “${resolveName(metadata.tags, filters.selectedTags[0], 'Selected tag')}”`);
  } else if (filters.selectedTags.length > 1) {
    reasons.push(`${filters.selectedTags.length} selected tags`);
  }

  if (filters.selectedCompany !== 'all') {
    reasons.push(
      `company “${resolveName(metadata.companies, filters.selectedCompany, 'Selected company')}”`
    );
  }

  if (filters.selectedArtist !== 'all') {
    reasons.push(
      `artist “${resolveName(metadata.artists, filters.selectedArtist, 'Selected artist')}”`
    );
  }

  if (filters.selectedDrillShape !== 'all') {
    reasons.push(`${filters.selectedDrillShape} drills`);
  }

  if (filters.selectedYearFinished !== 'all') {
    reasons.push(`finished in ${filters.selectedYearFinished}`);
  }

  if (!filters.includeMiniKits) {
    reasons.push('full-size kits');
  }

  return reasons;
};

export const buildDashboardEmptyState = (
  filters: FilterState,
  metadata: {
    companies?: NamedOption[];
    artists?: NamedOption[];
    tags?: NamedOption[];
  } = {}
): DashboardEmptyState => {
  const isUnfiltered = getActiveFilterCount(filters) === 0;
  const hasOnlyYearFinishedFilter =
    filters.activeStatus === 'completed' &&
    filters.selectedYearFinished !== 'all' &&
    filters.selectedCompany === 'all' &&
    filters.selectedArtist === 'all' &&
    filters.selectedDrillShape === 'all' &&
    filters.selectedTags.length === 0 &&
    filters.includeMiniKits &&
    !filters.includeDestashed &&
    !filters.includeArchived &&
    !filters.searchTerm.trim() &&
    !filters.searchAllFields;

  if (hasOnlyYearFinishedFilter) {
    return {
      title: 'No matching projects',
      description: `No kits completed yet in ${filters.selectedYearFinished}`,
      isUnfiltered: false,
    };
  }

  if (isUnfiltered) {
    return {
      title: 'No projects yet',
      description: 'Add your first project to start tracking your collection.',
      isUnfiltered: true,
    };
  }

  const normalizedMetadata = {
    companies: metadata.companies ?? [],
    artists: metadata.artists ?? [],
    tags: metadata.tags ?? [],
  };

  const reasonParts = buildReasonParts(filters, normalizedMetadata);
  const subject = STATUS_SUBJECTS[filters.activeStatus];

  if (reasonParts.length > 0) {
    return {
      title: 'No matching projects',
      description: `No ${subject} match ${formatReasonList(reasonParts)}.`,
      isUnfiltered: false,
    };
  }

  if (filters.activeStatus !== 'everything') {
    return {
      title: `No ${subject}`,
      description: STATUS_ONLY_DESCRIPTIONS[filters.activeStatus] || `No ${subject} yet.`,
      isUnfiltered: false,
    };
  }

  return {
    title: 'No matching projects',
    description: 'No projects match your current filters.',
    isUnfiltered: false,
  };
};
