import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDefaultColoringFilters,
  type PersistedColoringFilterState,
} from '@/contexts/ColoringFilterContext';
import { queryKeys } from '@/hooks/queries/queryKeys';
import {
  type ColoringNavigationContext,
  useSaveColoringNavigationContext,
} from '../useSaveColoringNavigationContext';

const { onAuthChangeMock, saveColoringNavigationContextMock } = vi.hoisted(() => ({
  onAuthChangeMock: vi.fn(),
  saveColoringNavigationContextMock: vi.fn(),
}));

vi.mock('@/services/auth', () => ({
  onAuthChange: onAuthChangeMock,
}));

vi.mock('@/services/pocketbase/dashboardSettings.service', () => ({
  DashboardSettingsService: {
    saveColoringNavigationContext: saveColoringNavigationContextMock,
  },
}));

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function makeNavigationContext(
  overrides: Partial<PersistedColoringFilterState> = {}
): ColoringNavigationContext {
  const { currentPage: _currentPage, ...defaults } = getDefaultColoringFilters();
  return { filters: { ...defaults, ...overrides } };
}

describe('useSaveColoringNavigationContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveColoringNavigationContextMock.mockResolvedValue('settings-1');
  });

  it('updates the saved coloring navigation context cache after a successful save', async () => {
    const client = makeClient();
    const userId = 'user-1';
    const key = queryKeys.dashboardSettings.coloringNavigationContext(userId);
    const staleContext = makeNavigationContext({ searchTerm: 'old cached search' });
    const savedContext = makeNavigationContext({
      searchTerm: 'new saved search',
      mysteryOnly: true,
    });

    client.setQueryData(key, staleContext);

    const { result } = renderHook(() => useSaveColoringNavigationContext(userId), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        userId,
        navigationContext: savedContext,
      });
    });

    expect(saveColoringNavigationContextMock).toHaveBeenCalledWith(userId, savedContext, undefined);
    expect(client.getQueryData(key)).toEqual(savedContext);
  });

  it('serializes saves so older preference state cannot finish last', async () => {
    const client = makeClient();
    const userId = 'user-1';
    let resolveFirst: ((value: string) => void) | undefined;
    saveColoringNavigationContextMock
      .mockImplementationOnce(
        () =>
          new Promise<string>(resolve => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce('settings-1');

    const { result } = renderHook(() => useSaveColoringNavigationContext(userId), {
      wrapper: makeWrapper(client),
    });
    const firstPreferences = makeNavigationContext({ searchTerm: 'first' });
    const secondPreferences = makeNavigationContext({ searchTerm: 'second' });

    let firstSave: Promise<void>;
    let secondSave: Promise<void>;
    act(() => {
      firstSave = result.current.mutateAsync({ userId, navigationContext: firstPreferences });
      secondSave = result.current.mutateAsync({ userId, navigationContext: secondPreferences });
    });

    await waitFor(() => expect(saveColoringNavigationContextMock).toHaveBeenCalledTimes(1));
    resolveFirst?.('settings-1');
    await act(async () => {
      await firstSave!;
      await secondSave!;
    });

    expect(saveColoringNavigationContextMock.mock.calls.map(call => call[1])).toEqual([
      firstPreferences,
      secondPreferences,
    ]);
    expect(
      client.getQueryData(queryKeys.dashboardSettings.coloringNavigationContext(userId))
    ).toEqual(secondPreferences);
  });

  it('updates the cache before the preference save finishes', async () => {
    const client = makeClient();
    const userId = 'user-1';
    const key = queryKeys.dashboardSettings.coloringNavigationContext(userId);
    let resolveSave: ((value: string) => void) | undefined;
    saveColoringNavigationContextMock.mockImplementationOnce(
      () =>
        new Promise<string>(resolve => {
          resolveSave = resolve;
        })
    );
    const nextPreferences = makeNavigationContext({ pageSize: 25 });
    client.setQueryData(key, makeNavigationContext());

    const { result } = renderHook(() => useSaveColoringNavigationContext(userId), {
      wrapper: makeWrapper(client),
    });

    let save: Promise<void>;
    act(() => {
      save = result.current.mutateAsync({ userId, navigationContext: nextPreferences });
    });

    await waitFor(() => expect(client.getQueryData(key)).toEqual(nextPreferences));
    expect(saveColoringNavigationContextMock).toHaveBeenCalledTimes(1);

    resolveSave?.('settings-1');
    await act(async () => save!);
  });

  it('restores the confirmed cache when an optimistic save fails', async () => {
    const client = makeClient();
    const userId = 'user-1';
    const key = queryKeys.dashboardSettings.coloringNavigationContext(userId);
    const confirmed = makeNavigationContext({ searchTerm: 'confirmed' });
    client.setQueryData(key, confirmed);
    saveColoringNavigationContextMock.mockRejectedValueOnce(new Error('save failed'));

    const { result } = renderHook(() => useSaveColoringNavigationContext(userId), {
      wrapper: makeWrapper(client),
    });

    await expect(
      act(() =>
        result.current.mutateAsync({
          userId,
          navigationContext: makeNavigationContext({ searchTerm: 'optimistic' }),
        })
      )
    ).rejects.toThrow('save failed');

    expect(client.getQueryData(key)).toEqual(confirmed);
  });

  it('restores the last confirmed cache when consecutive queued saves fail', async () => {
    const client = makeClient();
    const userId = 'user-1';
    const key = queryKeys.dashboardSettings.coloringNavigationContext(userId);
    const confirmed = makeNavigationContext({ searchTerm: 'confirmed' });
    client.setQueryData(key, confirmed);
    saveColoringNavigationContextMock.mockRejectedValue(new Error('save failed'));

    const { result } = renderHook(() => useSaveColoringNavigationContext(userId), {
      wrapper: makeWrapper(client),
    });

    let firstSave: Promise<void>;
    let secondSave: Promise<void>;
    act(() => {
      firstSave = result.current.mutateAsync({
        userId,
        navigationContext: makeNavigationContext({ searchTerm: 'first' }),
      });
      secondSave = result.current.mutateAsync({
        userId,
        navigationContext: makeNavigationContext({ searchTerm: 'second' }),
      });
    });

    await expect(firstSave!).rejects.toThrow('save failed');
    await expect(secondSave!).rejects.toThrow('save failed');
    expect(client.getQueryData(key)).toEqual(confirmed);
  });

  it('removes optimistic data when the prior query failed without cached data', async () => {
    const client = makeClient();
    const userId = 'user-1';
    const key = queryKeys.dashboardSettings.coloringNavigationContext(userId);
    await client
      .fetchQuery({
        queryKey: key,
        queryFn: () => Promise.reject(new Error('load failed')),
        retry: false,
      })
      .catch(() => undefined);
    expect(client.getQueryState(key)?.status).toBe('error');
    expect(client.getQueryData(key)).toBeUndefined();
    saveColoringNavigationContextMock.mockRejectedValueOnce(new Error('save failed'));

    const { result } = renderHook(() => useSaveColoringNavigationContext(userId), {
      wrapper: makeWrapper(client),
    });

    await expect(
      act(() =>
        result.current.mutateAsync({
          userId,
          navigationContext: makeNavigationContext({ pageSize: 25 }),
        })
      )
    ).rejects.toThrow('save failed');

    expect(client.getQueryData(key)).toBeUndefined();
  });
});
