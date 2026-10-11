import { beforeEach, describe, expect, it, renderHookWithProviders, waitFor } from '@/test-utils';
import { createTestQueryClient } from '@/test-utils';
import { vi } from 'vitest';
import { queryKeys } from '../queryKeys';
import { useStatsSummary } from '../useStats';
import { queryFreshness } from '../shared/queryUtils';
import {
  useColoringCollectionStats,
  useColoringCompletionTimeStats,
  useColoringCompletionsByMonth,
  useColoringCompletionsYearly,
  useColoringStatsSummary,
  useCollectionStats,
  useCompletionTimeStats,
  useCompletionsByMonth,
  useCompletionsYearly,
} from '../useStats';

const {
  mockUser,
  mockGetStatsSummary,
  mockGetCompletionsByMonth,
  mockGetCompletionsYearly,
  mockGetCompletionTimeStats,
  mockGetCollectionStats,
  mockGetColoringStatsSummary,
  mockGetColoringCompletionsByMonth,
  mockGetColoringCompletionsYearly,
  mockGetColoringCompletionTimeStats,
  mockGetColoringCollectionStats,
} = vi.hoisted(() => ({
  mockUser: { current: undefined as undefined | { id: string } },
  mockGetStatsSummary: vi.fn(),
  mockGetCompletionsByMonth: vi.fn(),
  mockGetCompletionsYearly: vi.fn(),
  mockGetCompletionTimeStats: vi.fn(),
  mockGetCollectionStats: vi.fn(),
  mockGetColoringStatsSummary: vi.fn(),
  mockGetColoringCompletionsByMonth: vi.fn(),
  mockGetColoringCompletionsYearly: vi.fn(),
  mockGetColoringCompletionTimeStats: vi.fn(),
  mockGetColoringCollectionStats: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser.current }),
}));

vi.mock('@/services/pocketbase/projects.service', () => ({
  projectsService: {
    getStatsSummary: mockGetStatsSummary,
    getCompletionsByMonth: mockGetCompletionsByMonth,
    getCompletionsYearly: mockGetCompletionsYearly,
    getCompletionTimeStats: mockGetCompletionTimeStats,
    getCollectionStats: mockGetCollectionStats,
  },
}));

vi.mock('@/services/pocketbase/coloring.service', () => ({
  ColoringService: {
    getStatsSummary: mockGetColoringStatsSummary,
    getCompletionsByMonth: mockGetColoringCompletionsByMonth,
    getCompletionsYearly: mockGetColoringCompletionsYearly,
    getCompletionTimeStats: mockGetColoringCompletionTimeStats,
    getCollectionStats: mockGetColoringCollectionStats,
  },
}));

describe('stats query hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.current = { id: 'user-123' };
  });

  it('gates all stats hooks on an authenticated user', () => {
    mockUser.current = undefined;
    const cases = [
      {
        useHook: () => useStatsSummary(2026),
        service: mockGetStatsSummary,
      },
      {
        useHook: () => useCompletionsByMonth(2026),
        service: mockGetCompletionsByMonth,
      },
      {
        useHook: () => useCompletionsYearly(),
        service: mockGetCompletionsYearly,
      },
      {
        useHook: () => useCompletionTimeStats(),
        service: mockGetCompletionTimeStats,
      },
      {
        useHook: () => useCollectionStats(),
        service: mockGetCollectionStats,
      },
      {
        useHook: () => useColoringStatsSummary(2026),
        service: mockGetColoringStatsSummary,
      },
      {
        useHook: () => useColoringCompletionsByMonth(2026),
        service: mockGetColoringCompletionsByMonth,
      },
      {
        useHook: () => useColoringCompletionsYearly(),
        service: mockGetColoringCompletionsYearly,
      },
      {
        useHook: () => useColoringCompletionTimeStats(),
        service: mockGetColoringCompletionTimeStats,
      },
      {
        useHook: () => useColoringCollectionStats(),
        service: mockGetColoringCollectionStats,
      },
    ];

    for (const testCase of cases) {
      const queryClient = createTestQueryClient();
      const { result } = renderHookWithProviders(testCase.useHook, { queryClient });

      expect(result.current.isFetching).toBe(false);
      expect(testCase.service).not.toHaveBeenCalled();
    }
  });

  it('uses the interactive freshness profile for stats queries', () => {
    mockGetStatsSummary.mockResolvedValue({
      generatedAt: '2026-05-02T16:00:00.000Z',
      year: 2026,
      metrics: {},
      statusBreakdown: {},
    });
    const queryClient = createTestQueryClient();

    renderHookWithProviders(() => useStatsSummary(2026), { queryClient });

    const query = queryClient
      .getQueryCache()
      .find({ queryKey: queryKeys.stats.summary('user-123', 2026) });

    expect(query?.options).toMatchObject(queryFreshness('interactive'));
  });

  it('fetches the stats summary endpoint', async () => {
    const response = {
      generatedAt: '2026-05-02T16:00:00.000Z',
      year: 2026,
      metrics: {},
      statusBreakdown: {},
    };
    mockGetStatsSummary.mockResolvedValue(response);

    const { result } = renderHookWithProviders(() => useStatsSummary(2026));

    await waitFor(() => expect(result.current.data).toEqual(response));
    expect(mockGetStatsSummary).toHaveBeenCalledWith(2026);
  });

  it('fetches monthly completions for the requested year', async () => {
    const response = { generatedAt: 'now', year: 2026, total: 0, months: [] };
    mockGetCompletionsByMonth.mockResolvedValue(response);

    const { result } = renderHookWithProviders(() => useCompletionsByMonth(2026));

    await waitFor(() => expect(result.current.data).toEqual(response));
    expect(mockGetCompletionsByMonth).toHaveBeenCalledWith(2026);
  });

  it('fetches yearly completions', async () => {
    const response = { generatedAt: 'now', total: 0, years: [] };
    mockGetCompletionsYearly.mockResolvedValue(response);

    const { result } = renderHookWithProviders(() => useCompletionsYearly());

    await waitFor(() => expect(result.current.data).toEqual(response));
    expect(mockGetCompletionsYearly).toHaveBeenCalledTimes(1);
  });

  it('fetches completion time stats', async () => {
    const response = {
      generatedAt: 'now',
      averageCompletionDays: null,
      averageStashDwellDays: null,
      averageTimeToStartDays: null,
      fastestCompletion: null,
      slowestCompletion: null,
      mostProductiveMonth: null,
    };
    mockGetCompletionTimeStats.mockResolvedValue(response);

    const { result } = renderHookWithProviders(() => useCompletionTimeStats());

    await waitFor(() => expect(result.current.data).toEqual(response));
    expect(mockGetCompletionTimeStats).toHaveBeenCalledTimes(1);
  });

  it('fetches collection stats', async () => {
    const response = {
      generatedAt: 'now',
      topCompanies: [],
      topCompaniesGroup: { total: 0, items: [], otherCount: 0 },
      topArtists: [],
      topArtistsGroup: { total: 0, items: [], otherCount: 0 },
      topTags: [],
      topTagsGroup: { total: 0, items: [], otherCount: 0 },
      drillShapeSplit: [],
      kitCategorySplit: [],
      sizeBuckets: [],
    };
    mockGetCollectionStats.mockResolvedValue(response);

    const { result } = renderHookWithProviders(() => useCollectionStats());

    await waitFor(() => expect(result.current.data).toEqual(response));
    expect(mockGetCollectionStats).toHaveBeenCalledTimes(1);
  });

  it('fetches coloring stats summary for the requested year', async () => {
    const response = {
      generatedAt: 'now',
      year: 2026,
      metrics: {},
      bookStatusBreakdown: {},
      pageStatusBreakdown: {},
    };
    mockGetColoringStatsSummary.mockResolvedValue(response);

    const { result } = renderHookWithProviders(() => useColoringStatsSummary(2026));

    await waitFor(() => expect(result.current.data).toEqual(response));
    expect(mockGetColoringStatsSummary).toHaveBeenCalledWith(2026);
  });

  it('fetches coloring monthly completions for the requested year', async () => {
    const response = { generatedAt: 'now', year: 2026, total: 0, months: [] };
    mockGetColoringCompletionsByMonth.mockResolvedValue(response);

    const { result } = renderHookWithProviders(() => useColoringCompletionsByMonth(2026));

    await waitFor(() => expect(result.current.data).toEqual(response));
    expect(mockGetColoringCompletionsByMonth).toHaveBeenCalledWith(2026);
  });

  it('fetches coloring yearly, timing, and collection stats', async () => {
    mockGetColoringCompletionsYearly.mockResolvedValue({ generatedAt: 'now', total: 0, years: [] });
    mockGetColoringCompletionTimeStats.mockResolvedValue({
      generatedAt: 'now',
      averagePageCompletionDays: null,
      averageBookDwellDays: null,
      fastestPageCompletion: null,
      slowestPageCompletion: null,
      mostProductiveMonth: null,
    });
    mockGetColoringCollectionStats.mockResolvedValue({
      generatedAt: 'now',
      topPublishers: [],
      topPublishersGroup: { total: 0, items: [], otherCount: 0 },
      topIllustrators: [],
      topIllustratorsGroup: { total: 0, items: [], otherCount: 0 },
      topTags: [],
      topTagsGroup: { total: 0, items: [], otherCount: 0 },
      topMediums: [],
      topMediumsGroup: { total: 0, items: [], otherCount: 0 },
      bookStatusSplit: [],
      pageStatusSplit: [],
      completionBuckets: [],
    });

    renderHookWithProviders(() => useColoringCompletionsYearly());
    renderHookWithProviders(() => useColoringCompletionTimeStats());
    renderHookWithProviders(() => useColoringCollectionStats());

    await waitFor(() => expect(mockGetColoringCompletionsYearly).toHaveBeenCalledTimes(1));
    expect(mockGetColoringCompletionTimeStats).toHaveBeenCalledTimes(1);
    expect(mockGetColoringCollectionStats).toHaveBeenCalledTimes(1);
  });
});
