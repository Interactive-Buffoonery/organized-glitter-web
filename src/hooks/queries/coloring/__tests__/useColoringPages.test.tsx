import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ClientResponseError } from 'pocketbase';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { queryClient } from '@/lib/queryClient';
import { useColoringPages } from '../useColoringPages';
import { useColoringPage } from '../useColoringPage';

const mocks = vi.hoisted(() => ({ listPages: vi.fn(), getPageById: vi.fn() }));
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

  it('does not seed a page detail while its fetch is in flight', async () => {
    mocks.listPages.mockResolvedValue({ items: [{ id: 'page' }] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const detailKey = queryKeys.coloring.pages.detail('page');
    let rejectDetail!: (error: ClientResponseError) => void;
    const detailPromise = new Promise<never>((_resolve, reject) => {
      rejectDetail = reject;
    });
    const detailFetch = client
      .fetchQuery({ queryKey: detailKey, queryFn: () => detailPromise })
      .catch(() => undefined);

    expect(client.getQueryState(detailKey)?.fetchStatus).toBe('fetching');
    const { result } = renderPages(client);

    try {
      await waitFor(() => expect(result.current.data).toBeDefined());
      expect(client.getQueryState(detailKey)?.fetchStatus).toBe('fetching');
      expect(client.getQueryData(detailKey)).toBeUndefined();
    } finally {
      rejectDetail(new ClientResponseError({ status: 403 }));
      await detailFetch;
    }

    expect(client.getQueryState(detailKey)?.status).toBe('error');
    expect(client.getQueryData(detailKey)).toBeUndefined();
  });

  it('recovers an offline detail through reconnect without a list seed', async () => {
    let backendAvailable = false;
    mocks.getPageById.mockImplementation(() =>
      backendAvailable
        ? Promise.resolve({ id: 'page', title: 'Recovered detail' })
        : Promise.reject(new ClientResponseError({ status: 0 }))
    );
    mocks.listPages.mockResolvedValue({ items: [{ id: 'page', title: 'List data' }] });
    const defaults = queryClient.getDefaultOptions();
    const client = new QueryClient({
      defaultOptions: {
        ...defaults,
        queries: { ...defaults.queries, retryDelay: 0 },
      },
    });
    const detailKey = queryKeys.coloring.pages.detail('page');
    const detail = renderHook(() => useColoringPage('page'), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    let list: ReturnType<typeof renderPages> | undefined;

    try {
      await waitFor(() => expect(detail.result.current.isError).toBe(true));
      list = renderPages(client);
      await waitFor(() => expect(list?.result.current.data).toBeDefined());
      expect(client.getQueryState(detailKey)?.status).toBe('error');
      expect(client.getQueryData(detailKey)).toBeUndefined();

      backendAvailable = true;
      act(() => onlineManager.setOnline(false));
      act(() => onlineManager.setOnline(true));

      await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
      expect(detail.result.current.data).toEqual({ id: 'page', title: 'Recovered detail' });
    } finally {
      list?.unmount();
      detail.unmount();
      client.clear();
      onlineManager.setOnline(true);
    }
  });
});
