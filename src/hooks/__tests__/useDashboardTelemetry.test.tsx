import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultFilters } from '@/contexts/FilterContext/types';
import { useDashboardTelemetry } from '../useDashboardTelemetry';

const mocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  logRenderCount: vi.fn(),
  shouldLog: vi.fn(),
  renderGuardState: { renderCount: 1, isExcessive: false },
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: mocks.debug,
    info: mocks.info,
  }),
  dashboardLogger: {
    logRenderCount: mocks.logRenderCount,
  },
}));

vi.mock('@/utils/query/renderGuards', () => ({
  useRenderGuard: () => ({ getRenderStats: () => mocks.renderGuardState }),
  useThrottledLogger: () => ({ shouldLog: mocks.shouldLog }),
}));

const baseFilters = {
  ...getDefaultFilters(),
  activeStatus: 'progress' as const,
  currentPage: 2,
  sortField: 'last_updated' as const,
  sortDirection: 'desc' as const,
  searchTerm: 'winter',
};

const baseProjectsQuery = {
  data: undefined,
  isLoading: false,
  isFetching: false,
  isStale: false,
  error: null,
  refetch: vi.fn(),
};

const renderTelemetry = (overrides: Partial<Parameters<typeof useDashboardTelemetry>[0]> = {}) =>
  renderHook(() =>
    useDashboardTelemetry({
      userId: 'user-1',
      filters: baseFilters,
      filterCriteria: {
        status: 'progress',
        searchTerm: 'winter',
        searchAllFields: false,
        selectedTags: [],
      },
      companiesSignature: 'company-1,company-2',
      artistsSignature: 'artist-1',
      selectedTagsSignature: '',
      companiesCount: 2,
      artistsCount: 1,
      projectsQuery: baseProjectsQuery,
      ...overrides,
    })
  );

describe('useDashboardTelemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.renderGuardState = { renderCount: 1, isExcessive: false };
    mocks.shouldLog.mockReturnValue(false);
  });

  it('can render with baseline telemetry inputs', () => {
    renderTelemetry();

    expect(mocks.logRenderCount).not.toHaveBeenCalled();
  });

  it('logs excessive render counts through dashboardLogger', () => {
    mocks.renderGuardState = { renderCount: 16, isExcessive: true };
    mocks.shouldLog.mockReturnValue(false);

    renderTelemetry();

    expect(mocks.logRenderCount).toHaveBeenCalledWith('useDashboardData', 16, true);
    expect(mocks.debug).not.toHaveBeenCalled();
  });

  it('logs excessive render debug context when the throttle allows it', () => {
    mocks.renderGuardState = { renderCount: 17, isExcessive: true };
    mocks.shouldLog.mockReturnValue(true);

    renderTelemetry();

    expect(mocks.debug).toHaveBeenCalledWith(
      'useDashboardData excessive re-renders detected',
      expect.objectContaining({
        renderCount: 17,
        isExcessive: true,
        hasUserId: true,
        companiesCount: 2,
        artistsCount: 1,
        companiesSignature: 'company-1,company-2',
        artistsSignature: 'artist-1',
        selectedTagsSignature: '',
        filterActiveStatus: 'progress',
        filterCurrentPage: 2,
      })
    );
  });

  it('logs project loading state', () => {
    renderTelemetry({
      projectsQuery: {
        ...baseProjectsQuery,
        isLoading: true,
      },
    });

    expect(mocks.info).toHaveBeenCalledWith('[DASHBOARD] Loading projects...', {
      currentPage: 2,
      activeStatus: 'progress',
      sortField: 'last_updated',
      sortDirection: 'desc',
      hasSearchTerm: true,
    });
  });

  it('logs project success state', () => {
    renderTelemetry({
      projectsQuery: {
        ...baseProjectsQuery,
        data: {
          projects: [{ id: 'project-1' } as never],
          totalItems: 1,
          totalItemsIsEstimate: false,
          totalPages: 1,
          statusCounts: {
            wishlist: 0,
            purchased: 0,
            stash: 0,
            kitted: 0,
            progress: 1,
            onhold: 0,
            completed: 0,
            archived: 0,
            destashed: 0,
          },
        },
        isStale: true,
      },
    });

    expect(mocks.info).toHaveBeenCalledWith('[DASHBOARD] Projects loaded successfully', {
      projectsCount: 1,
      totalItems: 1,
      totalPages: 1,
      isStale: true,
    });
  });
});
