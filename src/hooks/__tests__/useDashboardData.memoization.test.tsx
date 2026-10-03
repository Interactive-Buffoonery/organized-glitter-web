/**
 * Regression tests for useDashboardData metadata memoization.
 *
 * Asserts that `allCompanies` / `allArtists` passed to useProjects keep the
 * same reference when MetadataContext re-emits an array with identical IDs.
 * Without content-signature memoization, a metadata refetch returning the
 * same IDs still churns the downstream query key and trips
 * `useProjects`' render guard (threshold 8).
 *
 * Related: GitHub issue #142, the historical dashboard refresh-loop regression.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDashboardData } from '../useDashboardData';
import { getDefaultFilters } from '@/contexts/FilterContext/types';

// Mock useMetadata so we can drive the companies/artists input directly.
const metadataState: {
  companies: Array<{ id: string; name: string; user: string }>;
  artists: Array<{ id: string; name: string; user: string }>;
} = {
  companies: [],
  artists: [],
};

vi.mock('@/contexts/MetadataContext', () => ({
  useMetadata: () => ({
    companies: metadataState.companies,
    artists: metadataState.artists,
    tags: [],
    companyNames: [],
    artistNames: [],
    isLoading: { companies: false, artists: false, tags: false },
    error: { companies: null, artists: null, tags: null },
  }),
}));

// Mock useProjects so we can inspect the array refs it receives.
const useDashboardTelemetryMock = vi.hoisted(() => vi.fn());
const refetchMock = vi.hoisted(() => vi.fn());
const projectsQueryResult = vi.hoisted(() => ({
  data: undefined,
  isLoading: false,
  isFetching: false,
  isStale: false,
  error: null,
  refetch: refetchMock,
}));

const useProjectsCalls: Array<{
  params?: {
    pageSize?: number;
    filters?: {
      searchTerm?: string;
    };
  };
  companies: unknown;
  artists: unknown;
}> = [];

vi.mock('@/hooks/queries/useProjects', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/queries/useProjects')>(
    '@/hooks/queries/useProjects'
  );
  return {
    ...actual,
    useProjects: (params: unknown, companies: unknown, artists: unknown) => {
      useProjectsCalls.push({
        params: params as { pageSize?: number; filters?: { searchTerm?: string } },
        companies,
        artists,
      });
      return projectsQueryResult;
    },
  };
});

vi.mock('@/hooks/useDashboardTelemetry', () => ({
  useDashboardTelemetry: (input: unknown) => useDashboardTelemetryMock(input),
}));

const makeCompany = (id: string) => ({ id, name: `company-${id}`, user: 'u1' });
const makeArtist = (id: string) => ({ id, name: `artist-${id}`, user: 'u1' });

describe('useDashboardData metadata memoization', () => {
  beforeEach(() => {
    useProjectsCalls.length = 0;
    useDashboardTelemetryMock.mockClear();
    metadataState.companies = [];
    metadataState.artists = [];
  });

  it('keeps allCompanies reference stable when MetadataContext re-emits identical IDs', () => {
    metadataState.companies = [makeCompany('a'), makeCompany('b')];

    const { rerender } = renderHook(() => useDashboardData('user-1', getDefaultFilters()));
    const firstRef = useProjectsCalls.at(-1)?.companies;

    // Re-emit with a brand new array containing the same IDs (fresh refs throughout).
    metadataState.companies = [makeCompany('a'), makeCompany('b')];
    rerender();
    const secondRef = useProjectsCalls.at(-1)?.companies;

    expect(firstRef).toBeDefined();
    expect(secondRef).toBe(firstRef);
  });

  it('changes allCompanies reference when the ID set actually changes', () => {
    metadataState.companies = [makeCompany('a'), makeCompany('b')];

    const { rerender } = renderHook(() => useDashboardData('user-1', getDefaultFilters()));
    const firstRef = useProjectsCalls.at(-1)?.companies;

    metadataState.companies = [makeCompany('a'), makeCompany('c')];
    rerender();
    const secondRef = useProjectsCalls.at(-1)?.companies;

    expect(firstRef).toBeDefined();
    expect(secondRef).not.toBe(firstRef);
  });

  it('keeps allArtists reference stable when MetadataContext re-emits identical IDs', () => {
    metadataState.artists = [makeArtist('x'), makeArtist('y')];

    const { rerender } = renderHook(() => useDashboardData('user-1', getDefaultFilters()));
    const firstRef = useProjectsCalls.at(-1)?.artists;

    metadataState.artists = [makeArtist('x'), makeArtist('y')];
    rerender();
    const secondRef = useProjectsCalls.at(-1)?.artists;

    expect(firstRef).toBeDefined();
    expect(secondRef).toBe(firstRef);
  });

  it('changes allArtists reference when the ID set actually changes', () => {
    metadataState.artists = [makeArtist('x'), makeArtist('y')];

    const { rerender } = renderHook(() => useDashboardData('user-1', getDefaultFilters()));
    const firstRef = useProjectsCalls.at(-1)?.artists;

    metadataState.artists = [makeArtist('x'), makeArtist('z')];
    rerender();
    const secondRef = useProjectsCalls.at(-1)?.artists;

    expect(firstRef).toBeDefined();
    expect(secondRef).not.toBe(firstRef);
  });

  it('keeps the configured pageSize while searching', () => {
    const filters = {
      ...getDefaultFilters(),
      searchTerm: 'winter',
      pageSize: 25,
    };

    renderHook(() => useDashboardData('user-1', filters));

    const lastCall = useProjectsCalls.at(-1);
    expect(lastCall?.params?.filters?.searchTerm).toBe('winter');
    expect(lastCall?.params?.pageSize).toBe(25);
  });

  it('passes projects query state to dashboard telemetry without changing the public return shape', () => {
    const result = renderHook(() => useDashboardData('user-1', getDefaultFilters())).result.current;

    expect(useDashboardTelemetryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        projectsQuery: projectsQueryResult,
        companiesCount: 0,
        artistsCount: 0,
      })
    );
    expect(result).toEqual({
      projects: [],
      totalItems: 0,
      totalItemsIsEstimate: false,
      totalPages: 0,
      isLoadingProjects: false,
      isFetchingProjects: false,
      errorProjects: null,
      refetchProjects: refetchMock,
    });
  });
});
