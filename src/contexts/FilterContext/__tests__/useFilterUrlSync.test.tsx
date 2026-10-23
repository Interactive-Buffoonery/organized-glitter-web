import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { FilterStateProvider, useFilterState } from '../FilterStateContext';
import { useFilterUrlSync } from '../useFilterUrlSync';
import type { FilterState } from '../types';

let setFilters:
  | ((updates: Partial<FilterState> | ((current: FilterState) => Partial<FilterState>)) => void)
  | null = null;

const UrlReader = () => {
  const [searchParams] = useSearchParams();
  return <span data-testid="url-params">{searchParams.toString()}</span>;
};

const Harness = () => {
  const state = useFilterState();
  setFilters = state.setFilters;
  useFilterUrlSync();
  return <UrlReader />;
};

const renderHarness = ({
  initialRoute,
  initialFilters,
}: {
  initialRoute: string;
  initialFilters?: Partial<FilterState>;
}) =>
  render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <FilterStateProvider initialFilters={initialFilters} isMobilePhone={false}>
        <Harness />
      </FilterStateProvider>
    </MemoryRouter>
  );

describe('useFilterUrlSync', () => {
  beforeEach(() => {
    setFilters = null;
  });

  it('writes canonical params and removes legacy tag params when filters change', async () => {
    renderHarness({ initialRoute: '/dashboard?tag=legacy&keepme=yes' });

    await act(async () => {
      setFilters?.({
        activeStatus: 'completed',
        selectedTags: ['tag-1', 'tag-2'],
        searchTerm: 'Winter Moon',
      });
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const params = screen.getByTestId('url-params').textContent || '';
    expect(params).toContain('status=completed');
    expect(params).toContain('tags=tag-1');
    expect(params).toContain('tags=tag-2');
    expect(params).toContain('search=Winter+Moon');
    expect(params).toContain('keepme=yes');
    expect(params).not.toContain('tag=legacy');
  });
});
