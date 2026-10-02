import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '../../../test-utils';
import ResultsSummaryBar from '../ResultsSummaryBar';

describe('ResultsSummaryBar', () => {
  it('shows mixed tag and filter copy when tags and other filters are active', () => {
    renderWithProviders(
      <ResultsSummaryBar
        totalItems={1}
        isLoading={false}
        sortField="last_updated"
        sortDirection="desc"
        activeFilterCount={3}
        activeFilterLabel="2 tags selected • 1 filter active"
        onClearAll={vi.fn()}
      />
    );

    expect(screen.getByText('2 tags selected • 1 filter active')).toBeInTheDocument();
  });

  it('renders "0 projects" when nothing matches', () => {
    renderWithProviders(
      <ResultsSummaryBar
        totalItems={0}
        isLoading={false}
        sortField="last_updated"
        sortDirection="desc"
        activeFilterCount={0}
        activeFilterLabel={null}
        onClearAll={vi.fn()}
      />
    );

    expect(screen.getByText('0 projects')).toBeInTheDocument();
  });

  it('renders an exact count (regression guard: prior bug displayed "-1 projects" on small search results)', () => {
    renderWithProviders(
      <ResultsSummaryBar
        totalItems={2}
        totalItemsIsEstimate={false}
        isLoading={false}
        sortField="last_updated"
        sortDirection="desc"
        activeFilterCount={1}
        activeFilterLabel="1 filter active"
        onClearAll={vi.fn()}
      />
    );

    expect(screen.getByText('2 projects')).toBeInTheDocument();
    expect(screen.queryByText(/-1/)).not.toBeInTheDocument();
  });

  it('renders a "+" suffix when totalItems is an estimate from PocketBase skipTotal', () => {
    renderWithProviders(
      <ResultsSummaryBar
        totalItems={25}
        totalItemsIsEstimate={true}
        isLoading={false}
        sortField="last_updated"
        sortDirection="desc"
        activeFilterCount={1}
        activeFilterLabel="1 filter active"
        onClearAll={vi.fn()}
      />
    );

    expect(screen.getByText('25+ projects')).toBeInTheDocument();
  });
});
