import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { ClientResponseError } from 'pocketbase';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultQueryRetry } from '@/lib/queryClient';
import { createErrorResponse, createSuccessResponse } from '@/types/shared';
import { useColoringTags } from '../useColoringTags';
import { useColoringBookTags } from '../useColoringBookTags';
import { useColoringTagStats } from '../useColoringTagStats';

const mocks = vi.hoisted(() => ({
  listColoringTags: vi.fn(),
  getBookTags: vi.fn(),
  getBulkColoringTagStats: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/services/pocketbase/coloringTags.service', () => ({ ColoringTagService: mocks }));

afterEach(() => vi.resetAllMocks());

const queries = [
  { name: 'tag list', useQueryHook: () => useColoringTags(), service: mocks.listColoringTags },
  {
    name: 'book tags',
    useQueryHook: () => useColoringBookTags('book'),
    service: mocks.getBookTags,
  },
  {
    name: 'tag stats',
    useQueryHook: () => useColoringTagStats(['tag']),
    service: mocks.getBulkColoringTagStats,
  },
];

describe.each(queries)('$name retry classification', ({ useQueryHook, service }) => {
  it.each([0, 429, 503])('recovers from a transient status %i', async status => {
    service
      .mockResolvedValueOnce(createErrorResponse(new ClientResponseError({ status })))
      .mockResolvedValueOnce(createSuccessResponse([]));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: defaultQueryRetry, retryDelay: 0 } },
    });
    const { result, unmount } = renderHook(useQueryHook, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    try {
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(service).toHaveBeenCalledTimes(2);
    } finally {
      unmount();
      client.clear();
    }
  });

  it.each([
    new ClientResponseError({ status: 401 }),
    new ClientResponseError({ status: 0, isAbort: true }),
  ])('preserves terminal failures without retrying', async error => {
    service.mockResolvedValue(createErrorResponse(error));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: defaultQueryRetry, retryDelay: 0 } },
    });
    const { result, unmount } = renderHook(useQueryHook, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    try {
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBe(error);
      expect(service).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
      client.clear();
    }
  });
});
