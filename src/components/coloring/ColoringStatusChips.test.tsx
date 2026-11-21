import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ColoringStatusChips } from './ColoringStatusChips';

const { updateStatuses, useQueries, filters } = vi.hoisted(() => ({
  updateStatuses: vi.fn(),
  useQueries: vi.fn(({ queries }: { queries: unknown[] }) =>
    [10, 2, 0, 3, 4, 1, 5, 6].slice(0, queries.length).map(totalItems => ({ data: { totalItems } }))
  ),
  filters: {
    selectedStatuses: ['wishlist'],
    selectedPublishers: [],
    selectedIllustrators: [],
    selectedTags: [],
    searchTerm: '',
    includeArchived: false,
    includeDestashed: false,
    mysteryOnly: false,
  },
}));
vi.mock('@tanstack/react-query', () => ({ useQueries }));
vi.mock('@/contexts/ColoringFilterContext', () => ({
  useColoringFilters: () => ({ filters, isNavigationContextReady: true }),
  useColoringFilterHelpers: () => ({ updateStatuses }),
}));

describe('coloring status chips', () => {
  afterEach(() => {
    filters.includeArchived = false;
    filters.includeDestashed = false;
    filters.selectedStatuses = ['wishlist'];
  });

  it('hides Archived and Destashed while their switches are off', () => {
    render(<ColoringStatusChips userId="example-user" />);
    expect(screen.queryByRole('button', { name: /Archived/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Destashed/ })).not.toBeInTheDocument();
  });

  it('shows Archived and Destashed when their switches are on', () => {
    filters.includeArchived = true;
    filters.includeDestashed = true;
    render(<ColoringStatusChips userId="example-user" />);
    expect(screen.getByRole('button', { name: 'Archived 5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Destashed 6' })).toBeInTheDocument();
  });

  it('keeps a selected Archived chip visible with its switch off', () => {
    filters.selectedStatuses = ['archived'];
    render(<ColoringStatusChips userId="example-user" />);
    expect(screen.getByRole('button', { name: 'Archived 5' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('preserves multiple selected statuses and clears with All', () => {
    render(<ColoringStatusChips userId="example-user" />);
    expect(screen.queryByRole('button', { name: /Purchased/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'In progress 4' }));
    expect(updateStatuses).toHaveBeenLastCalledWith(['wishlist', 'in_progress']);
    fireEvent.click(screen.getByRole('button', { name: 'Wishlist 2' }));
    expect(updateStatuses).toHaveBeenLastCalledWith([]);
    fireEvent.click(screen.getByRole('button', { name: 'All 10' }));
    expect(updateStatuses).toHaveBeenLastCalledWith([]);
  });
});
