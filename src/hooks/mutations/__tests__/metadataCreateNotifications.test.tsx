import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreateArtist } from '../useArtistMutations';
import { useCreateCompany } from '../useCompanyMutations';
import { SessionChangedError } from '@/services/auth/sessionRecovery';

const { createArtist, createCompany, notify } = vi.hoisted(() => ({
  createArtist: vi.fn(),
  createCompany: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/services/pocketbase/artists.service', () => ({
  ArtistsService: { create: createArtist },
}));
vi.mock('@/services/pocketbase/companies.service', () => ({
  CompaniesService: { create: createCompany },
}));
vi.mock('@/lib/notifications', () => ({ notify }));
vi.mock('@/services/analytics-escape-hatch', () => ({ capture: vi.fn() }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('deferred metadata creation notifications', () => {
  beforeEach(() => {
    notify.mockReset();
    createCompany.mockReset().mockResolvedValue({ id: 'company-1', name: 'New Company' });
    createArtist.mockReset().mockResolvedValue({ id: 'artist-1', name: 'New Artist' });
  });

  it('does not announce a company before the project save is confirmed', async () => {
    const { result } = renderHook(() => useCreateCompany({ notifyOnSuccess: false }), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'New Company' });
    });

    expect(createCompany).toHaveBeenCalledOnce();
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not announce an artist before the project save is confirmed', async () => {
    const { result } = renderHook(() => useCreateArtist({ notifyOnSuccess: false }), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'New Artist' });
    });

    expect(createArtist).toHaveBeenCalledOnce();
    expect(notify).not.toHaveBeenCalled();
  });

  it('still announces standalone company creation by default', async () => {
    const { result } = renderHook(() => useCreateCompany(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'New Company' });
    });

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
  });

  it('still announces standalone artist creation by default', async () => {
    const { result } = renderHook(() => useCreateArtist(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'New Artist' });
    });

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
  });

  it.each([
    ['company', createCompany, useCreateCompany],
    ['artist', createArtist, useCreateArtist],
  ] as const)(
    'does not report a confirmed late %s create as failed',
    async (_, create, useCreate) => {
      const wrapped = {
        type: 'server',
        message: 'Session changed',
        retryable: false,
        cause: { originalError: new SessionChangedError() },
      };
      create.mockRejectedValue(wrapped);
      const { result } = renderHook(() => useCreate(), { wrapper });

      await act(async () => {
        await expect(result.current.mutateAsync({ name: 'Late record' })).rejects.toBe(wrapped);
      });

      expect(notify).not.toHaveBeenCalled();
    }
  );
});
