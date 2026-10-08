import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type {
  CollectionStatsResponse,
  ColoringCollectionStatsResponse,
  ColoringCompletionTimeStatsResponse,
  ColoringStatsSummaryResponse,
  CompletionTimeStatsResponse,
  CompletionsByMonthResponse,
  CompletionsYearlyResponse,
  StatsSummaryResponse,
  StatsTopListGroup,
  StatsTopListItem,
} from '@/types/stats';

const { verticalsState, statsState, refetchMock } = vi.hoisted(() => ({
  verticalsState: {
    diamond_painting: true,
    coloring_books: true,
    isLoading: false,
  },
  statsState: {} as Record<string, unknown>,
  refetchMock: vi.fn(),
}));

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
}));

vi.mock('@/hooks/useEnabledVerticals', () => ({
  useEnabledVerticals: () => verticalsState,
}));

vi.mock('@/hooks/queries/useStats', () => ({
  useStatsSummary: () => statsState.diamondSummary,
  useCompletionsByMonth: () => statsState.diamondMonthly,
  useCompletionsYearly: () => statsState.diamondYearly,
  useCompletionTimeStats: () => statsState.diamondTimes,
  useCollectionStats: () => statsState.diamondCollection,
  useColoringStatsSummary: () => statsState.coloringSummary,
  useColoringCompletionsByMonth: () => statsState.coloringMonthly,
  useColoringCompletionsYearly: () => statsState.coloringYearly,
  useColoringCompletionTimeStats: () => statsState.coloringTimes,
  useColoringCollectionStats: () => statsState.coloringCollection,
}));

import Stats from '../Stats';

function query<T>(data: T, overrides: Partial<{ isLoading: boolean; isError: boolean }> = {}) {
  return {
    data,
    isLoading: false,
    isError: false,
    refetch: refetchMock,
    ...overrides,
  };
}

function group(
  items: StatsTopListItem[],
  total = items.reduce((sum, item) => sum + item.count, 0)
): StatsTopListGroup {
  return {
    total,
    items,
    otherCount: Math.max(0, total - items.reduce((sum, item) => sum + item.count, 0)),
  };
}

const monthLabels = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const months = Array.from({ length: 12 }, (_, index) => ({
  month: index + 1,
  label: monthLabels[index],
  count: index === 0 ? 2 : 0,
  previousYearCount: index === 0 ? 1 : 0,
  previousYearDelta: index === 0 ? 1 : 0,
  averageCompletionDays: index === 0 ? 4 : null,
}));

const diamondSummary: StatsSummaryResponse = {
  generatedAt: 'now',
  year: 2026,
  metrics: {
    totalKits: 12,
    completedThisYear: 3,
    inProgress: 1,
    inStash: 5,
    allTimeCompleted: 6,
    wishlistSize: 2,
  },
  statusBreakdown: {
    wishlist: 2,
    purchased: 1,
    stash: 3,
    kitted: 1,
    progress: 1,
    onhold: 0,
    completed: 4,
    archived: 0,
    destashed: 0,
  },
};

const coloringSummary: ColoringStatsSummaryResponse = {
  generatedAt: 'now',
  year: 2026,
  metrics: {
    totalBooks: 8,
    completedPagesThisYear: 14,
    activePages: 3,
    inStash: 4,
    allTimeCompletedPages: 30,
    wishlistSize: 1,
  },
  bookStatusBreakdown: {
    wishlist: 1,
    purchased: 2,
    in_stash: 2,
    in_progress: 2,
    completed: 1,
    archived: 0,
    destashed: 0,
  },
  pageStatusBreakdown: {
    not_started: 20,
    palette_chosen: 2,
    in_progress: 3,
    on_hold: 1,
    completed: 30,
  },
};

const completionMonths: CompletionsByMonthResponse = {
  generatedAt: 'now',
  year: 2026,
  total: 2,
  months,
};

const yearly: CompletionsYearlyResponse = {
  generatedAt: 'now',
  total: 10,
  years: [
    { year: 2026, count: 2, cumulativeCount: 10 },
    { year: 2025, count: 5, cumulativeCount: 8 },
    { year: 2024, count: 3, cumulativeCount: 3 },
  ],
};

const diamondTimes: CompletionTimeStatsResponse = {
  generatedAt: 'now',
  averageCompletionDays: 12,
  averageStashDwellDays: 30,
  averageTimeToStartDays: null,
  fastestCompletion: null,
  slowestCompletion: null,
  mostProductiveMonth: null,
};

const coloringTimes: ColoringCompletionTimeStatsResponse = {
  generatedAt: 'now',
  averagePageCompletionDays: 2,
  averageBookDwellDays: 11,
  fastestPageCompletion: null,
  slowestPageCompletion: null,
  mostProductiveMonth: null,
};

const companyItems = [{ id: 'company-1', label: 'Diamond Art Club', count: 4 }];
const artistItems = [{ id: 'artist-1', label: 'Example Artist', count: 2 }];
const diamondTagItems = [{ id: 'tag-1', label: 'Florals', count: 3 }];
const diamondCollection: CollectionStatsResponse = {
  generatedAt: 'now',
  topCompanies: companyItems,
  topCompaniesGroup: group(companyItems, 6),
  topArtists: artistItems,
  topArtistsGroup: group(artistItems),
  topTags: diamondTagItems,
  topTagsGroup: group(diamondTagItems),
  drillShapeSplit: [{ key: 'round', label: 'Round', count: 3 }],
  kitCategorySplit: [],
  sizeBuckets: [{ key: 'medium', label: '50-69.9 cm', count: 4 }],
};

const publisherItems = [{ id: 'publisher-1', label: 'Cute Books', count: 3 }];
const illustratorItems = [{ id: 'illustrator-1', label: 'Friendly Illustrator', count: 2 }];
const coloringTagItems = [{ id: 'tag-1', label: 'Animals', count: 5 }];
const mediumItems = [{ id: 'medium-1', label: 'Colored pencils', count: 6 }];
const coloringCollection: ColoringCollectionStatsResponse = {
  generatedAt: 'now',
  topPublishers: publisherItems,
  topPublishersGroup: group(publisherItems),
  topIllustrators: illustratorItems,
  topIllustratorsGroup: group(illustratorItems),
  topTags: coloringTagItems,
  topTagsGroup: group(coloringTagItems),
  topMediums: mediumItems,
  topMediumsGroup: group(mediumItems),
  bookStatusSplit: [
    { key: 'in_progress', label: 'In progress', count: 2 },
    { key: 'completed', label: 'Completed', count: 1 },
  ],
  pageStatusSplit: [
    { key: 'in_progress', label: 'In progress', count: 3 },
    { key: 'completed', label: 'Completed', count: 30 },
  ],
  completionBuckets: [
    { key: 'not_started', label: 'Not started', count: 2 },
    { key: 'started', label: '1-49%', count: 1 },
    { key: 'halfway', label: '50-99%', count: 1 },
    { key: 'completed', label: 'Completed', count: 1 },
  ],
};

function resetStatsState() {
  statsState.diamondSummary = query(diamondSummary);
  statsState.diamondMonthly = query(completionMonths);
  statsState.diamondYearly = query(yearly);
  statsState.diamondTimes = query(diamondTimes);
  statsState.diamondCollection = query(diamondCollection);
  statsState.coloringSummary = query(coloringSummary);
  statsState.coloringMonthly = query(completionMonths);
  statsState.coloringYearly = query(yearly);
  statsState.coloringTimes = query(coloringTimes);
  statsState.coloringCollection = query(coloringCollection);
}

describe('Stats page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verticalsState.diamond_painting = true;
    verticalsState.coloring_books = true;
    verticalsState.isLoading = false;
    resetStatsState();
  });

  it('renders the chart-led report without the old top-level tabs', () => {
    render(<Stats />);

    expect(screen.getByRole('heading', { name: 'Stats', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Summary' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Completions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Collection' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Diamond paintings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Coloring' })).toBeInTheDocument();
    expect(screen.getAllByText('Completed this year')).toHaveLength(2);
    expect(screen.getByText('Total kits')).toBeInTheDocument();
    expect(screen.getByText('Total books')).toBeInTheDocument();
  });

  it('shows the same exact in-stash count as the Library status filter', () => {
    render(<Stats />);

    const inStashRow = screen.getByText('In stash').closest('div');

    expect(inStashRow).not.toBeNull();
    expect(within(inStashRow as HTMLElement).getByText('3')).toBeInTheDocument();
    expect(within(inStashRow as HTMLElement).queryByText('5')).not.toBeInTheDocument();
  });

  it('changes craft scope without merging all-craft sections', async () => {
    const user = userEvent.setup();
    render(<Stats />);

    await user.click(screen.getByRole('button', { name: 'Coloring' }));

    expect(screen.queryByRole('heading', { name: 'Diamond paintings' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Coloring' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coloring' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('hides coloring scope and sections when coloring is disabled', () => {
    verticalsState.coloring_books = false;

    render(<Stats />);

    expect(screen.getByRole('heading', { name: 'Diamond paintings' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Coloring' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Coloring' })).not.toBeInTheDocument();
    expect(screen.queryByText('Total books')).not.toBeInTheDocument();
  });

  it('uses yearly chart data in all-time scope and hides prior-year lists', async () => {
    const user = userEvent.setup();
    render(<Stats />);

    expect(screen.getAllByLabelText('Prior year totals')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'All time' }));

    expect(screen.getAllByText('Completed, all time')).toHaveLength(2);
    expect(screen.queryByLabelText('Prior year totals')).not.toBeInTheDocument();
    expect(screen.getAllByText('Cumulative completed')).toHaveLength(2);
  });

  it('renders hidden chart and top-list tables with exact values', () => {
    render(<Stats />);

    const diamondChartCaption = screen
      .getAllByText('Diamond paintings completion chart')
      .find(element => element.tagName.toLowerCase() === 'caption');
    const diamondChartTable = diamondChartCaption?.closest('table');
    expect(diamondChartTable).not.toBeNull();
    expect(
      within(diamondChartTable as HTMLTableElement).getByText('Average finish time')
    ).toBeInTheDocument();
    expect(within(diamondChartTable as HTMLTableElement).getByText('+1')).toBeInTheDocument();
    expect(within(diamondChartTable as HTMLTableElement).getByText('4 days')).toBeInTheDocument();

    const topListTable = screen.getByText('Most represented Companies').closest('table');
    expect(topListTable).not.toBeNull();
    expect(
      within(topListTable as HTMLTableElement).getByText('Diamond Art Club')
    ).toBeInTheDocument();
    expect(within(topListTable as HTMLTableElement).getByText('Other')).toBeInTheDocument();
  });

  it('makes definition terms keyboard reachable', () => {
    render(<Stats />);

    const kittedTerm = screen.getByRole('button', { name: 'Kitted up' });
    kittedTerm.focus();

    expect(kittedTerm).toHaveFocus();
    const definitionTooltip = screen
      .getAllByRole('tooltip')
      .find(element => element.textContent === 'Drills sorted and ready to start.');
    expect(definitionTooltip).toBeInTheDocument();
  });

  it('keeps working blocks visible when one query fails', () => {
    statsState.coloringSummary = query(coloringSummary, { isError: true });

    render(<Stats />);

    expect(screen.getByText('Total kits')).toBeInTheDocument();
    expect(screen.getByText('Coloring library stats did not load')).toBeInTheDocument();
    expect(screen.getByText('Colored pencils')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
