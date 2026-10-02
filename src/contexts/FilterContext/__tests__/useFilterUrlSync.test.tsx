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

  it('preserves hydrated filter params and unrelated params on mount', async () => {
    renderHarness({
      initialRoute:
        '/dashboard?company=abc123&status=wishlist&artist=Jane&tags=Fantasy&tags=Garden&search=Winter&keepme=yes',
      initialFilters: {
        selectedCompany: 'abc123',
        activeStatus: 'wishlist',
        selectedArtist: 'Jane',
        selectedTags: ['Fantasy', 'Garden'],
        searchTerm: 'Winter',
      },
    });

    await act(() => new Promise(resolve => setTimeout(resolve, 0)));
    const params = screen.getByTestId('url-params').textContent || '';

    expect(params).toContain('company=abc123');
    expect(params).toContain('status=wishlist');
    expect(params).toContain('artist=Jane');
    expect(params).toContain('tags=Fantasy');
    expect(params).toContain('tags=Garden');
    expect(params).toContain('search=Winter');
    expect(params).toContain('keepme=yes');
  });

  it('marks the default snapshot on a clean mount', async () => {
    renderHarness({ initialRoute: '/dashboard' });

    await act(() => new Promise(resolve => setTimeout(resolve, 0)));

    expect(screen.getByTestId('url-params').textContent).toBe('page=1');
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

  it('clears filters while retaining the default snapshot marker', async () => {
    renderHarness({
      initialRoute: '/dashboard?status=wishlist&company=abc&artist=Jane&tags=tag-1&search=Winter',
      initialFilters: {
        activeStatus: 'wishlist',
        selectedCompany: 'abc',
        selectedArtist: 'Jane',
        selectedTags: ['tag-1'],
        searchTerm: 'Winter',
      },
    });

    await act(async () => {
      setFilters?.({
        activeStatus: 'everything',
        selectedCompany: '',
        selectedArtist: 'all',
        selectedTags: [],
        searchTerm: '   ',
      });
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId('url-params').textContent).toBe('page=1');
  });
});
