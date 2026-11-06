import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColoringStatusChips } from './ColoringStatusChips';

const { updateStatuses, useQueries, filters } = vi.hoisted(() => ({
  updateStatuses: vi.fn(),
  useQueries: vi.fn(() => [10, 2, 0, 3, 4, 1].map(totalItems => ({ data: { totalItems } }))),
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
