import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const updateSearchMock = vi.fn();
const updateSortMock = vi.fn();
const setViewTypeMock = vi.fn();

const coloringFiltersMock = {
  markUserInteraction: vi.fn(),
  filters: {
    selectedStatuses: [],
    selectedPublishers: [],
    selectedIllustrators: [],
    selectedTags: [],
    mysteryOnly: false,
    includeArchived: false,
    includeDestashed: false,
    searchTerm: '',
    sortField: 'date_added',
    sortDirection: 'desc',
  },
  viewType: 'grid',
  setViewType: setViewTypeMock,
  activeFilterCount: 0,
  publishers: [],
  illustrators: [],
  tags: [],
};

const posthogCaptureMock = vi.fn();

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: posthogCaptureMock }),
}));

vi.mock('@/contexts/ColoringFilterContext', () => ({
  useColoringFilters: () => coloringFiltersMock,
  useColoringFilterHelpers: () => ({
    updateSearch: updateSearchMock,
    updateSort: updateSortMock,
  }),
  getColoringFilterPanelCount: () => 0,
}));

import { ColoringControlsRow } from '../ColoringFilterStrip';

describe('ColoringControlsRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    updateSearchMock.mockClear();
    updateSortMock.mockClear();
    posthogCaptureMock.mockClear();
    coloringFiltersMock.filters.searchTerm = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('commits typed search text to the coloring filters', () => {
    render(<ColoringControlsRow />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search coloring books' }), {
      target: { value: 'Disney' },
    });

    act(() => {
      vi.advanceTimersByTime(349);
    });
    expect(updateSearchMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(updateSearchMock).toHaveBeenCalledWith('Disney');
    expect(posthogCaptureMock).toHaveBeenCalledWith('coloring_books_search_performed', {
      term_length: 6,
      craft: 'coloring',
      surface: 'coloring_books',
      active_filter_count: 0,
      had_filters: false,
    });
  });

  it('counts blur before the debounce once', () => {
    render(<ColoringControlsRow />);
    const search = screen.getByRole('searchbox', { name: 'Search coloring books' });
    fireEvent.change(search, { target: { value: 'Disney' } });
    fireEvent.blur(search);
    expect(updateSearchMock).toHaveBeenCalledWith('Disney');
    expect(posthogCaptureMock).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(350));
    expect(posthogCaptureMock).toHaveBeenCalledTimes(1);
  });

  it('does not count Enter again after the same search was committed', () => {
    render(<ColoringControlsRow />);
    const search = screen.getByRole('searchbox', { name: 'Search coloring books' });
    fireEvent.change(search, { target: { value: 'Disney' } });
    act(() => vi.advanceTimersByTime(350));
    fireEvent.submit(search.closest('form')!);
    expect(posthogCaptureMock).toHaveBeenCalledTimes(1);
  });

  it('commits Enter immediately without another event from the debounce', () => {
    render(<ColoringControlsRow />);
    const search = screen.getByRole('searchbox', { name: 'Search coloring books' });
    fireEvent.change(search, { target: { value: 'Disney' } });
    fireEvent.submit(search.closest('form')!);
    act(() => vi.advanceTimersByTime(350));
    expect(posthogCaptureMock).toHaveBeenCalledTimes(1);
  });

  it('does not count empty or whitespace-only searches', () => {
    render(<ColoringControlsRow />);
    const search = screen.getByRole('searchbox', { name: 'Search coloring books' });
    fireEvent.change(search, { target: { value: '   ' } });
    act(() => vi.advanceTimersByTime(350));
    expect(posthogCaptureMock).not.toHaveBeenCalled();
  });
});
