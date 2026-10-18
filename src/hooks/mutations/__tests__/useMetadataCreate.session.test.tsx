import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: { accountId: 'account-a', generation: 0 },
  createCompany: vi.fn(),
  createArtist: vi.fn(),
  notify: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@/services/auth/sessionIdentity', () => ({
  captureSessionIdentity: () => ({ ...mocks.session }),
  isCurrentSessionIdentity: (identity: { accountId: string; generation: number }) =>
    identity.accountId === mocks.session.accountId &&
    identity.generation === mocks.session.generation,
}));
vi.mock('@/services/pocketbase/companies.service', () => ({
  CompaniesService: { create: mocks.createCompany },
}));
vi.mock('@/services/pocketbase/artists.service', () => ({
  ArtistsService: { create: mocks.createArtist },
}));
vi.mock('@/lib/notifications', () => ({ notify: mocks.notify }));
vi.mock('@/services/analytics-escape-hatch', () => ({ capture: mocks.capture }));
import { useCreateCompany } from '../useCompanyMutations';
import { useCreateArtist } from '../useArtistMutations';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.accountId = 'account-a';
  mocks.session.generation = 0;
});

for (const [kind, useCreate, create] of [
  ['company', useCreateCompany, mocks.createCompany],
  ['artist', useCreateArtist, mocks.createArtist],
] as const) {
  describe(`${kind} create session ownership`, () => {
    it('keeps the invoking session across the TanStack onMutate await', async () => {
      let release!: () => void;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      const queryClient = new QueryClient({
        mutationCache: new MutationCache({ onMutate: () => gate }),
        defaultOptions: { mutations: { retry: false } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
      const { result } = renderHook(() => useCreate(), { wrapper });
      let pending!: Promise<unknown>;
      act(() => {
        pending = result.current.mutateAsync({ name: 'Origin metadata' });
      });
      const rejection = expect(pending).rejects.toMatchObject({ reason: 'session_changed' });
      mocks.session.accountId = 'account-b';
      mocks.session.generation += 1;
      await act(async () => {
        release();
        await rejection;
      });
      expect(create).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();
      expect(mocks.capture).not.toHaveBeenCalled();
    });

    it('keeps independent identities for concurrent calls sharing one input', async () => {
      let release!: () => void;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      const saved = { id: 'new-record', name: 'Shared metadata', websiteUrl: '' };
      create.mockResolvedValueOnce(saved);
      const queryClient = new QueryClient({
        mutationCache: new MutationCache({ onMutate: () => gate }),
        defaultOptions: { mutations: { retry: false } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
      const { result } = renderHook(() => useCreate(), { wrapper });
      const input = { name: 'Shared metadata' };
      let oldPending!: Promise<unknown>;
      let newPending!: Promise<unknown>;
      const onSuccess = vi.fn();
      act(() => {
        oldPending = result.current.mutateAsync(input);
      });
      const rejection = expect(oldPending).rejects.toMatchObject({ reason: 'session_changed' });
      mocks.session.accountId = 'account-b';
      mocks.session.generation += 1;
      act(() => {
        newPending = result.current.mutateAsync(input, { onSuccess });
      });
      await act(async () => {
        release();
        await rejection;
        await expect(newPending).resolves.toEqual(saved);
      });
      expect(create).toHaveBeenCalledOnce();
      expect(create).toHaveBeenCalledWith(input, { accountId: 'account-b', generation: 1 });
      expect(onSuccess).toHaveBeenCalledWith(saved, input, expect.anything(), expect.anything());
      await waitFor(() => expect(result.current.variables).toEqual(input));
    });

    it('does not publish a successful old create into the next account', async () => {
      let complete!: (value: unknown) => void;
      create.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            complete = resolve;
          })
      );
      const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      const invalidation = vi.spyOn(queryClient, 'invalidateQueries');
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
      const { result } = renderHook(() => useCreate(), { wrapper });
      let pending!: Promise<unknown>;
      const onSuccess = vi.fn();
      act(() => {
        pending = result.current.mutateAsync({ name: 'Origin metadata' }, { onSuccess });
      });
      await waitFor(() => expect(create).toHaveBeenCalledOnce());
      mocks.session.accountId = 'account-b';
      mocks.session.generation += 1;
      await act(async () => {
        complete({ id: 'old-record', name: 'Origin metadata', websiteUrl: '' });
        await pending.catch(() => undefined);
      });
      expect(invalidation).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();
      expect(mocks.capture).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });
}
