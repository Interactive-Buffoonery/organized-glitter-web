import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCollectionStats, useCompletionsByMonth } from '@/hooks/queries/useStats';
import type { StatsSizeBucket } from '@/types/stats';
import Stats from '../Stats';

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/hooks/useAppReady', () => ({ useAppReady: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/hooks/useEnabledVerticals', () => ({
  useEnabledVerticals: () => ({ diamond_painting: true, coloring_books: false }),
}));
vi.mock('@/hooks/queries/useStats', () => {
  const emptyQuery = () => ({ isLoading: false, isError: false, refetch: vi.fn() });
  return {
    useStatsSummary: emptyQuery,
    useCompletionsByMonth: vi.fn(emptyQuery),
    useCompletionsYearly: emptyQuery,
    useCompletionTimeStats: emptyQuery,
    useCollectionStats: vi.fn(),
    useColoringStatsSummary: emptyQuery,
    useColoringCompletionsByMonth: emptyQuery,
    useColoringCompletionsYearly: emptyQuery,
    useColoringCompletionTimeStats: emptyQuery,
    useColoringCollectionStats: emptyQuery,
  };
});

function renderWithSizeBuckets(sizeBuckets: StatsSizeBucket[]) {
  vi.mocked(useCollectionStats).mockReturnValue({
    data: {
      generatedAt: '',
      topCompaniesGroup: { total: 0, items: [], otherCount: 0 },
      topArtistsGroup: { total: 0, items: [], otherCount: 0 },
      topTagsGroup: { total: 0, items: [], otherCount: 0 },
      topCompanies: [],
      topArtists: [],
      topTags: [],
      drillShapeSplit: [],
      kitCategorySplit: [],
      sizeBuckets,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as ReturnType<typeof useCollectionStats>);
  render(<Stats />);
  return screen.getByText('Most common size').nextElementSibling;
}

describe('Most common size', () => {
  const mini: StatsSizeBucket = { key: 'mini', label: '<30 cm', count: 1 };
  const large: StatsSizeBucket = { key: 'large', label: '70-109.9 cm', count: 17 };
  const huge: StatsSizeBucket = { key: 'huge', label: '110+ cm', count: 14 };
  const unknown: StatsSizeBucket = { key: 'unknown', label: 'Unknown', count: 20 };

  it('shows the bucket with the highest count', () => {
    expect(renderWithSizeBuckets([mini, large, huge])).toHaveTextContent(large.label);
  });

  it('breaks ties in favor of the first bucket in display order', () => {
    expect(renderWithSizeBuckets([mini, large, { ...huge, count: 17 }])).toHaveTextContent(
      large.label
    );
  });

  it('shows a placeholder when no bucket has any kits', () => {
    expect(renderWithSizeBuckets([{ ...mini, count: 0 }])).toHaveTextContent('-');
  });

  it('shows the most common measured size when more kits have an unknown size', () => {
    expect(renderWithSizeBuckets([{ ...large, count: 5 }, unknown])).toHaveTextContent(large.label);
  });

  it('shows a placeholder when all kits have an unknown size', () => {
    expect(renderWithSizeBuckets([{ ...large, count: 0 }, unknown])).toHaveTextContent('-');
  });
});

it('uses singular and plural elapsed days in monthly stats', () => {
  const months = [0, 1, 2].map((days, index) => ({
    month: index + 1,
    label: ['Jan', 'Feb', 'Mar'][index],
    count: 1,
    previousYearCount: 0,
    previousYearDelta: 1,
    averageCompletionDays: days,
  }));
  vi.mocked(useCompletionsByMonth).mockReturnValue({
    data: { generatedAt: '', year: new Date().getFullYear(), total: 3, months },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as ReturnType<typeof useCompletionsByMonth>);
  renderWithSizeBuckets([]);
  const table = within(screen.getByRole('table'));
  expect(table.getByRole('cell', { name: '0 days' })).toBeInTheDocument();
  expect(table.getByRole('cell', { name: '1 day' })).toBeInTheDocument();
  expect(table.getByRole('cell', { name: '2 days' })).toBeInTheDocument();
});
