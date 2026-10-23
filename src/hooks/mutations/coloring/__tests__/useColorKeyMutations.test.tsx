import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/hooks/queries/queryKeys';
import {
  useCreateColorKey,
  useDeleteColorKey,
  useSetupColorKeys,
  useUpdateColorKey,
} from '../useColorKeyMutations';

const service = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  setup: vi.fn(),
}));
vi.mock('@/services/pocketbase/colorKeys.service', () => ({ ColorKeysService: service }));
vi.mock('@/services/auth', () => ({ getCurrentUserId: () => 'owner' }));

const row = (id: string, position: number, extra: Record<string, unknown> = {}) => ({
  id,
  position,
  created: `2026-01-0${position + 1}`,
  symbol: 'u:0031',
  code: '',
  ...extra,
});

let client: QueryClient;
const listKey = queryKeys.coloring.colorKeys.list('owner', 'page');
const historyKey = queryKeys.coloring.colorKeys.history('owner');
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});

describe('color key mutations', () => {
  it('adds a created key in strip order and refreshes code history', async () => {
    client.setQueryData(listKey, [row('a', 0), row('c', 2)]);
    client.setQueryData(historyKey, []);
    service.create.mockResolvedValue(row('b', 1));
    const { result } = renderHook(() => useCreateColorKey('page', 'owner'), { wrapper });
    await act(() => result.current.mutateAsync({ symbol: 'u:0031', position: 1 }));
    expect(client.getQueryData<{ id: string }[]>(listKey)?.map(key => key.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(client.getQueryState(historyKey)?.isInvalidated).toBe(true);
  });

  it('stores the server record after update, including a resolved symbol', async () => {
    client.setQueryData(listKey, [row('a', 0, { symbol: 'r:abcdefghijklmno' })]);
    service.update.mockResolvedValue(row('a', 0, { symbol: 'u:03C8', code: '654' }));
    const { result } = renderHook(() => useUpdateColorKey('page', 'owner'), { wrapper });
    await act(() =>
      result.current.mutateAsync({ id: 'a', input: { symbol: 'r:abcdefghijklmno', code: '654' } })
    );
    expect(client.getQueryData(listKey)).toEqual([row('a', 0, { symbol: 'u:03C8', code: '654' })]);
  });

  it('removes a deleted key right away and restores it when the delete fails', async () => {
    client.setQueryData(listKey, [row('a', 0), row('b', 1)]);
    let reject: (error: Error) => void = () => {};
    service.remove.mockReturnValue(new Promise((_, fail) => (reject = fail)));
    const { result } = renderHook(() => useDeleteColorKey('page', 'owner'), { wrapper });
    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = result.current.mutateAsync('a').catch(() => {});
    });
    await vi.waitFor(() =>
      expect(client.getQueryData<{ id: string }[]>(listKey)?.map(key => key.id)).toEqual(['b'])
    );
    await act(async () => {
      reject(new Error('offline'));
      await pending;
    });
    expect(client.getQueryData<{ id: string }[]>(listKey)?.map(key => key.id)).toEqual(['a', 'b']);
  });

  it('fills an empty page with the setup rows', async () => {
    client.setQueryData(listKey, []);
    client.setQueryData(historyKey, []);
    service.setup.mockResolvedValue([row('a', 0), row('b', 1)]);
    const { result } = renderHook(() => useSetupColorKeys('page', 'owner'), { wrapper });
    await act(() => result.current.mutateAsync(['u:0031', 'u:0032']));
    expect(service.setup).toHaveBeenCalledWith('page', 'owner', ['u:0031', 'u:0032']);
    expect(client.getQueryData<unknown[]>(listKey)).toHaveLength(2);
    expect(client.getQueryState(historyKey)?.isInvalidated).toBe(false);
  });

  it('reloads the page after a failed setup so it shows what the server has', async () => {
    client.setQueryData(listKey, []);
    service.setup.mockRejectedValue(new Error('This page already has symbols.'));
    const { result } = renderHook(() => useSetupColorKeys('page', 'owner'), { wrapper });
    await act(() => result.current.mutateAsync(['u:0031']).catch(() => {}));
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });

  it('reloads the page after a failed update', async () => {
    client.setQueryData(listKey, [row('a', 0)]);
    service.update.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useUpdateColorKey('page', 'owner'), { wrapper });
    await act(() => result.current.mutateAsync({ id: 'a', input: { code: '1' } }).catch(() => {}));
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });

  it('refreshes code history only when the code, name or swatch changed', async () => {
    client.setQueryData(listKey, [row('a', 0, { code: '654', color_name: '', swatch: '' })]);
    client.setQueryData(historyKey, []);
    service.update.mockResolvedValue(
      row('a', 0, { code: '654', color_name: '', swatch: '', note: 'soft' })
    );
    const { result } = renderHook(() => useUpdateColorKey('page', 'owner'), { wrapper });
    await act(() => result.current.mutateAsync({ id: 'a', input: { note: 'soft' } }));
    expect(client.getQueryState(historyKey)?.isInvalidated).toBe(false);
    service.update.mockResolvedValue(row('a', 0, { code: '655', color_name: '', swatch: '' }));
    await act(() => result.current.mutateAsync({ id: 'a', input: { code: '655' } }));
    expect(client.getQueryState(historyKey)?.isInvalidated).toBe(true);
  });
});
