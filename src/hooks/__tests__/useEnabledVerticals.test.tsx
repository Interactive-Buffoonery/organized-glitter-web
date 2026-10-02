import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { getVerticalTogglesMock } = vi.hoisted(() => ({
  getVerticalTogglesMock: vi.fn(),
}));

vi.mock('@/services/pocketbase/dashboardSettings.service', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/services/pocketbase/dashboardSettings.service')>();
  return {
    ...actual,
    DashboardSettingsService: {
      ...actual.DashboardSettingsService,
      getVerticalToggles: getVerticalTogglesMock,
    },
  };
});

import { useEnabledVerticals } from '../useEnabledVerticals';
import { DEFAULT_VERTICAL_TOGGLES } from '@/services/pocketbase/dashboardSettings.service';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
};

describe('useEnabledVerticals', () => {
  beforeEach(() => {
    getVerticalTogglesMock.mockReset();
  });

  it('returns the diamond-only default when the service falls back (no settings row)', async () => {
    getVerticalTogglesMock.mockResolvedValue(DEFAULT_VERTICAL_TOGGLES);

    const { result } = renderHook(() => useEnabledVerticals('user-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.diamond_painting).toBe(true);
    expect(result.current.coloring_books).toBe(false);
    expect(getVerticalTogglesMock).toHaveBeenCalledWith('user-1');
  });

  it('returns the persisted toggles for an opted-in user', async () => {
    getVerticalTogglesMock.mockResolvedValue({
      diamond_painting: true,
      coloring_books: true,
    });

    const { result } = renderHook(() => useEnabledVerticals('user-2'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.diamond_painting).toBe(true);
    expect(result.current.coloring_books).toBe(true);
  });

  it('falls back to defaults if a legacy row has both verticals disabled', async () => {
    getVerticalTogglesMock.mockResolvedValue({
      diamond_painting: false,
      coloring_books: false,
    });

    const { result } = renderHook(() => useEnabledVerticals('user-3'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.diamond_painting).toBe(true);
    expect(result.current.coloring_books).toBe(false);
  });

  it('does not query when userId is undefined and falls back to defaults', () => {
    const { result } = renderHook(() => useEnabledVerticals(undefined), { wrapper });

    expect(getVerticalTogglesMock).not.toHaveBeenCalled();
    expect(result.current.diamond_painting).toBe(true);
    expect(result.current.coloring_books).toBe(false);
  });
});
