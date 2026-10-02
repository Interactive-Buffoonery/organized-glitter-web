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
  it('updates a row in a flat list and re-sorts by name', () => {
    const list: CompanyListItem[] = [
      { id: 'a', name: 'Alpha', website_url: '' },
      { id: 'b', name: 'Bravo', website_url: 'https://b.example' },
    ];
    const next = mergeUpdatedCompanyIntoCompanyQueriesCache(list, 'b', {
      name: 'Apple',
      website_url: 'https://b.example',
    }) as CompanyListItem[];
    expect(next).not.toBe(list);
    expect(next.map(c => c.id)).toEqual(['a', 'b']);
    expect(next.find(c => c.id === 'b')?.name).toBe('Apple');
  });

  it('returns the same reference when id is not in a flat list', () => {
    const list: CompanyListItem[] = [{ id: 'a', name: 'Alpha', website_url: '' }];
    const next = mergeUpdatedCompanyIntoCompanyQueriesCache(list, 'missing', {
      name: 'X',
      website_url: '',
    });
    expect(next).toBe(list);
  });

  it('updates companies inside paginated result shape', () => {
    const data = {
      companies: [
        { id: 'a', name: 'Alpha', website_url: '' },
        { id: 'b', name: 'Bravo', website_url: '' },
      ] as CompanyListItem[],
      totalItems: 2,
      totalPages: 1,
    };
    const next = mergeUpdatedCompanyIntoCompanyQueriesCache(data, 'b', {
      name: 'Zulu',
      website_url: 'https://z.example',
    }) as typeof data;
    expect(next).not.toBe(data);
    expect(next.companies.find(c => c.id === 'b')?.name).toBe('Zulu');
    expect(next.companies[0].name).toBe('Alpha');
    expect(next.companies[1].name).toBe('Zulu');
  });

  it('passes through unrelated cache shapes', () => {
    expect(
      mergeUpdatedCompanyIntoCompanyQueriesCache(undefined, 'x', { name: 'n', website_url: '' })
    ).toBe(undefined);
    expect(
      mergeUpdatedCompanyIntoCompanyQueriesCache({ foo: 1 }, 'x', { name: 'n', website_url: '' })
    ).toEqual({
      foo: 1,
    });
  });
});

describe('insertCreatedCompanyIntoCompanyQueriesCache', () => {
  it('adds a created company to a flat list and re-sorts by name', () => {
    const list: CompanyListItem[] = [
      { id: 'b', name: 'Bravo', website_url: '' },
      { id: 'd', name: 'Delta', website_url: '' },
    ];
    const next = insertCreatedCompanyIntoCompanyQueriesCache(list, {
      id: 'a',
      name: 'Alpha',
      website_url: 'https://a.example',
    }) as CompanyListItem[];

    expect(next).not.toBe(list);
    expect(next.map(company => company.name)).toEqual(['Alpha', 'Bravo', 'Delta']);
    expect(next.find(company => company.id === 'a')?.website_url).toBe('https://a.example');
  });

  it('does not duplicate a created company that is already cached', () => {
    const list: CompanyListItem[] = [{ id: 'a', name: 'Alpha', website_url: '' }];
    const next = insertCreatedCompanyIntoCompanyQueriesCache(list, {
      id: 'a',
      name: 'Alpha',
      website_url: '',
    });

    expect(next).toBe(list);
  });

  it('does not duplicate a created company already in the paginated shape', () => {
    const data = {
      companies: [{ id: 'a', name: 'Alpha', website_url: '' }] as CompanyListItem[],
      totalItems: 1,
      totalPages: 1,
    };
    const next = insertCreatedCompanyIntoCompanyQueriesCache(data, {
      id: 'a',
      name: 'Alpha',
      website_url: '',
    });

    expect(next).toBe(data);
  });

  it('leaves paginated result caches unchanged without explicit page-size knowledge', () => {
    const data = {
      companies: [{ id: 'b', name: 'Bravo', website_url: '' }] as CompanyListItem[],
      totalItems: 1,
      totalPages: 1,
    };
    const next = insertCreatedCompanyIntoCompanyQueriesCache(data, {
      id: 'a',
      name: 'Alpha',
      website_url: '',
    });

    expect(next).toBe(data);
  });

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

  it('keeps consistent metadata across larger multi-page caches', () => {
    const companies = Array.from({ length: 500 }, (_, index) => ({
      id: `id-${String(index).padStart(3, '0')}`,
      name: `Company ${String(index).padStart(3, '0')}`,
      website_url: '',
    })) as CompanyListItem[];
    const data = { companies, totalItems: 750, totalPages: 2 };

    const next = insertCreatedCompanyIntoCompanyQueriesCache(
      data,
      {
        id: 'new',
        name: 'AAA First',
        website_url: '',
      },
      { pageSize: 500 }
    ) as typeof data;

    expect(next.totalItems).toBe(751);
    expect(next.totalPages).toBe(2);
    expect(next.companies).toHaveLength(500);
    expect(next.companies[0].name).toBe('AAA First');
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

  it('passes through unrelated cache shapes', () => {
    expect(
      insertCreatedCompanyIntoCompanyQueriesCache(undefined, {
        id: 'x',
        name: 'X',
        website_url: '',
      })
    ).toBe(undefined);
    expect(
      insertCreatedCompanyIntoCompanyQueriesCache(
        { foo: 1 },
        { id: 'x', name: 'X', website_url: '' }
      )
    ).toEqual({
      foo: 1,
    });
  });
});
