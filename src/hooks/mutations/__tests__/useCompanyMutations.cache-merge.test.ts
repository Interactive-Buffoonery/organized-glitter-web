import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  insertCreatedCompanyIntoAllCompanyQueriesCache,
  insertCreatedCompanyIntoCompanyQueriesCache,
  mergeUpdatedCompanyIntoCompanyQueriesCache,
} from '../useCompanyMutations';
import type { CompanyListItem } from '@/services/pocketbase/companies.service';
import { queryKeys } from '@/hooks/queries/queryKeys';

describe('mergeUpdatedCompanyIntoCompanyQueriesCache', () => {
  it('preserves source rows and pagination metadata while reordering a renamed row', () => {
    const first = Object.freeze({ id: 'a', name: 'Alpha', website_url: '' });
    const second = Object.freeze({ id: 'b', name: 'Bravo', website_url: '' });
    const companies = Object.freeze([first, second]);
    const data = Object.freeze({ companies, totalItems: 20, totalPages: 2 });
    const next = mergeUpdatedCompanyIntoCompanyQueriesCache(data, 'b', {
      name: 'Aardvark',
      website_url: 'https://b.example',
    }) as typeof data;

    expect(next.companies.map(company => company.id)).toEqual(['b', 'a']);
    expect(next.companies[1]).toBe(first);
    expect(second.name).toBe('Bravo');
    expect(companies).toEqual([first, second]);
    expect(next.totalItems).toBe(20);
    expect(next.totalPages).toBe(2);
  });
});

describe('insertCreatedCompanyIntoCompanyQueriesCache', () => {
  // Regression: previously bumped totalItems without recomputing totalPages,
  // leaving inconsistent pagination metadata until invalidation refetched.
  it('recomputes totalPages and trims an over-full multi-page cache', () => {
    // 2 pages of 2: page one is full with [Alpha, Charlie], one row on page two.
    const data = {
      companies: [
        { id: 'a', name: 'Alpha', website_url: '' },
        { id: 'c', name: 'Charlie', website_url: '' },
      ] as CompanyListItem[],
      totalItems: 3,
      totalPages: 2,
    };
    const next = insertCreatedCompanyIntoCompanyQueriesCache(
      data,
      {
        id: 'b',
        name: 'Bravo',
        website_url: '',
      },
      { pageSize: 2 }
    ) as typeof data;

    expect(next).not.toBe(data);
    expect(next.totalItems).toBe(4);
    expect(next.totalPages).toBe(2);
    expect(next.companies).toHaveLength(2);
    expect(next.companies.map(company => company.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('uses the query-key page size instead of inferring from last-page totals', () => {
    const queryClient = new QueryClient();
    const queryKey = queryKeys.companies.list('user-1', { currentPage: 2, pageSize: 25 });
    const companies = Array.from({ length: 15 }, (_, index) => ({
      id: `id-${String(index).padStart(2, '0')}`,
      name: `Company ${String(index).padStart(2, '0')}`,
      website_url: '',
    })) as CompanyListItem[];

    queryClient.setQueryData(queryKey, {
      companies,
      totalItems: 40,
      totalPages: 2,
    });

    insertCreatedCompanyIntoAllCompanyQueriesCache(queryClient, {
      id: 'new',
      name: 'AAA First',
      website_url: '',
    });

    const next = queryClient.getQueryData(queryKey) as {
      companies: CompanyListItem[];
      totalItems: number;
      totalPages: number;
    };
    expect(next.totalItems).toBe(41);
    expect(next.totalPages).toBe(2);
    expect(next.companies).toHaveLength(16);
    expect(next.companies[0].name).toBe('AAA First');
  });
});
