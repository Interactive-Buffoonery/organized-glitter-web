import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useColorReferenceImages } from '../useColorReference';
import type { ColorReference } from '@/services/pocketbase/colorReferences.service';

const urls = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock('@/services/pocketbase/colorReferences.service', () => ({
  ColorReferencesService: { urls },
}));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('swatch image refresh', () => {
  it('keeps notes-only references idle across refresh intervals', async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const { result, unmount } = renderHook(
      () =>
        useColorReferenceImages(
          { page: 'page', updated: 'revision', photos: [] } as unknown as ColorReference,
          'owner'
        ),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(urls).not.toHaveBeenCalled();
    unmount();
    client.clear();
  });
});
