import { QueryClient } from '@tanstack/react-query';
import { ClientResponseError } from 'pocketbase';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getList: vi.fn() }));
vi.mock('@/lib/pocketbase', () => ({
  pb: {
    collection: vi.fn(() => ({ getList: mocks.getList })),
    filter: vi.fn((expression: string, values: Record<string, string>) =>
      expression.replace('{:userId}', JSON.stringify(values.userId))
    ),
  },
}));
vi.mock('@/services/auth', () => ({
  isAuthenticated: vi.fn(() => true),
  getCurrentUserId: vi.fn(() => 'user-123'),
}));

import { allCompaniesOptions, artistsOptions, tagsOptions } from '../queryOptionsFactory';
import { defaultQueryRetry } from '@/lib/queryClient';
import { BookPublishersService } from '@/services/pocketbase/bookPublishers.service';
import { BookIllustratorsService } from '@/services/pocketbase/bookIllustrators.service';

describe('complete taxonomy queries', () => {
  beforeEach(() => mocks.getList.mockReset());

  const cases = [
    { label: 'companies', count: 501, pageSize: 500, options: allCompaniesOptions },
    { label: 'artists', count: 501, pageSize: 500, options: artistsOptions },
    { label: 'tags', count: 201, pageSize: 200, options: tagsOptions },
  ];

  for (const { label, count, pageSize, options } of cases) {
    it(`includes all ${count} ${label} beyond the first page`, async () => {
      const items = Array.from({ length: count }, (_, index) => ({
        id: `item-${index}`,
        name: `Name ${String(index).padStart(4, '0')}`,
        user: 'user-123',
      }));
      mocks.getList.mockImplementation(async (page: number, size: number) => ({
        items: items.slice((page - 1) * size, page * size),
        totalItems: count,
        totalPages: Math.ceil(count / size),
      }));
      const client = new QueryClient();
      try {
        const result = await client.fetchQuery({ ...options('user-123'), retry: false });
        expect(result.map(item => item.id)).toEqual(items.map(item => item.id));
        expect(mocks.getList).toHaveBeenCalledTimes(2);
        for (const [index, call] of mocks.getList.mock.calls.entries()) {
          expect(call[0]).toBe(index + 1);
          expect(call[1]).toBe(pageSize);
          expect(call[2].filter).toContain('user-123');
          expect(call[2].sort).toBe('name,id');
        }
      } finally {
        client.clear();
      }
    });

    it.skipIf(label === 'tags')(
      `offers support for the ${label} limit without caching partial data`,
      async () => {
        mocks.getList.mockResolvedValue({ items: [], totalItems: 5_001, totalPages: 11 });
        const client = new QueryClient();
        const query = options('user-123');
        try {
          const error = await client.fetchQuery({ ...query, retry: false }).catch(error => error);
          expect(error).toMatchObject({ reason: 'read_limit_exceeded' });
          expect(error.message).toContain(`5,000 ${label}`);
          expect(error.message).toContain('Contact your administrator');
          expect(client.getQueryData(query.queryKey)).toBeUndefined();
          expect(mocks.getList).toHaveBeenCalledTimes(1);
        } finally {
          client.clear();
        }
      }
    );

    it(`rejects ${label} when a subsequent page fails instead of caching an incomplete list`, async () => {
      mocks.getList
        .mockResolvedValueOnce({
          items: [{ id: 'first', name: 'First' }],
          totalItems: 2,
          totalPages: 2,
        })
        .mockRejectedValueOnce(new Error('Second page unavailable'));
      const client = new QueryClient();
      const query = options('user-123');
      try {
        await expect(client.fetchQuery({ ...query, retry: false })).rejects.toThrow();
        expect(client.getQueryData(query.queryKey)).toBeUndefined();
      } finally {
        client.clear();
      }
    });
  }
});

describe('complete coloring taxonomy queries', () => {
  for (const [label, service] of [
    ['publishers', BookPublishersService],
    ['illustrators', BookIllustratorsService],
  ] as const) {
    it(`includes all ${label} beyond record 500`, async () => {
      const items = Array.from({ length: 501 }, (_, index) => ({
        id: `item-${index}`,
        name: `Name ${index}`,
      }));
      const list = vi.spyOn(service, 'list').mockImplementation(async (_userId, params) => ({
        items: items.slice(((params?.page ?? 1) - 1) * 500, (params?.page ?? 1) * 500),
        totalItems: 501,
        totalPages: 2,
      }));
      try {
        const { items: result } = await service.listAll('user-123');
        expect(result.map(item => item.id)).toEqual(items.map(item => item.id));
        expect(list).toHaveBeenCalledTimes(2);
        expect(list).toHaveBeenNthCalledWith(1, 'user-123', { page: 1, pageSize: 500 });
        expect(list).toHaveBeenNthCalledWith(2, 'user-123', { page: 2, pageSize: 500 });
      } finally {
        list.mockRestore();
      }
    });

    it(`rejects ${label} when a later page fails`, async () => {
      const list = vi
        .spyOn(service, 'list')
        .mockResolvedValueOnce({
          items: [{ id: 'first', name: 'First' }],
          totalItems: 501,
          totalPages: 2,
        })
        .mockRejectedValueOnce(new Error('Second page unavailable'));
      try {
        await expect(service.listAll('user-123')).rejects.toThrow('Second page unavailable');
      } finally {
        list.mockRestore();
      }
    });
  }
});

describe('tag query failures', () => {
  beforeEach(() => mocks.getList.mockReset());

  it('rethrows the classified error so the retry policy can read it', async () => {
    mocks.getList.mockRejectedValueOnce(new ClientResponseError({ status: 503, data: {} }));

    const failure = await new QueryClient({ defaultOptions: { queries: { retry: false } } })
      .fetchQuery(tagsOptions('user-123'))
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ClientResponseError);
    expect(defaultQueryRetry(0, failure)).toBe(true);
  });
});
