import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { ClientResponseError } from 'pocketbase';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { useColoringPages } from '../useColoringPages';

const mocks = vi.hoisted(() => ({ listPages: vi.fn() }));
vi.mock('@/services/pocketbase/coloring.service', () => ({ ColoringService: mocks }));

const renderPages = (client: QueryClient) =>
  renderHook(() => useColoringPages({ bookId: 'book' }), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });

describe('useColoringPages detail seeding', () => {
  it('seeds page details from the list', async () => {
    mocks.listPages.mockResolvedValue({ items: [{ id: 'page' }] });
    const client = new QueryClient();

    const { result } = renderPages(client);

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(client.getQueryData(queryKeys.coloring.pages.detail('page'))).toEqual({ id: 'page' });
  });

  it('keeps a failed page detail failed so denied pages stay hidden', async () => {
    mocks.listPages.mockResolvedValue({ items: [{ id: 'page' }] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const denied = new ClientResponseError({ status: 403 });
    await client
      .fetchQuery({
        queryKey: queryKeys.coloring.pages.detail('page'),
        queryFn: () => Promise.reject(denied),
      })
      .catch(() => undefined);

    const { result } = renderPages(client);

    await waitFor(() => expect(result.current.data).toBeDefined());
    const state = client.getQueryState(queryKeys.coloring.pages.detail('page'));
    expect(state?.status).toBe('error');
    expect(state?.data).toBeUndefined();
  });
});
