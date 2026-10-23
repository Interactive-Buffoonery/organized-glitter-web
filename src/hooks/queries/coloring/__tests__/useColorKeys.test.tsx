import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { useColorKeyHistory, useSymbolRequests } from '../useColorKeys';

const service = vi.hoisted(() => ({ list: vi.fn(), history: vi.fn(), requests: vi.fn() }));
vi.mock('@/services/pocketbase/colorKeys.service', () => ({ ColorKeysService: service }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('color key queries', () => {
  it('keys page lists per user so accounts never share a cache entry', () => {
    expect(queryKeys.coloring.colorKeys.list('a', 'page')).not.toEqual(
      queryKeys.coloring.colorKeys.list('b', 'page')
    );
    expect(JSON.stringify(queryKeys.coloring.colorKeys.list('owner', 'page'))).not.toContain(
      'owner'
    );
  });

  it('waits to load history until the entry asks for it', async () => {
    service.history.mockResolvedValue([]);
    const { rerender } = renderHook(({ enabled }) => useColorKeyHistory('owner', enabled), {
      wrapper,
      initialProps: { enabled: false },
    });
    expect(service.history).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(service.history).toHaveBeenCalledWith('owner'));
  });

  it('looks up only the request ids in use, in a stable order', async () => {
    service.requests.mockResolvedValue({});
    renderHook(
      () => useSymbolRequests('owner', ['r:bbbbbbbbbbbbbbb', 'u:0031', 'r:aaaaaaaaaaaaaaa']),
      {
        wrapper,
      }
    );
    await waitFor(() =>
      expect(service.requests).toHaveBeenCalledWith('owner', ['aaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbb'])
    );
  });
});
