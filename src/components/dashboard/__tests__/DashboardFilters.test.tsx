import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardFilters from '@/components/dashboard/DashboardFilters';
import { getDefaultFilters } from '@/contexts/FilterContext/types';
import { useFilters } from '@/contexts/FilterContext';

vi.mock('@posthog/react', () => ({ usePostHog: () => undefined }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/queries/useAvailableYears', () => ({
  useAvailableYears: () => ({ data: [] }),
}));
vi.mock('@/contexts/FilterContext', () => ({
  useFilters: vi.fn(),
  useFilterHelpers: () => ({}),
}));

const renderWithStatus = (activeStatus: ReturnType<typeof getDefaultFilters>['activeStatus']) => {
  vi.mocked(useFilters).mockReturnValue({
    filters: { ...getDefaultFilters(), activeStatus },
    companies: [],
    artists: [],
    tags: [],
    setFilters: vi.fn(),
  } as unknown as ReturnType<typeof useFilters>);
  render(<DashboardFilters />);
};

describe('DashboardFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers destashed and archived kits under All', () => {
    renderWithStatus('everything');

    expect(screen.getByLabelText('Destashed kits')).toBeInTheDocument();
    expect(screen.getByLabelText('Archived kits')).toBeInTheDocument();
  });

  it('hides destashed and archived kits under a specific status', () => {
    renderWithStatus('wishlist');

    expect(screen.queryByLabelText('Destashed kits')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Archived kits')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Mini kits')).toBeInTheDocument();
  });

  it('labels the slower search without separate helper text', () => {
    renderWithStatus('everything');

    expect(screen.getByLabelText('Search notes and kit links (slower)')).toBeInTheDocument();
    expect(screen.queryByText(/Searches may take longer/)).not.toBeInTheDocument();
  });
});
