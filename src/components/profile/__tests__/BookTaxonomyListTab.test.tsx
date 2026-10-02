import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/hooks/queries/queryKeys';

const { mockPublisherUpdate, mockIllustratorUpdate, mockNotify } = vi.hoisted(() => ({
  mockPublisherUpdate: vi.fn(),
  mockIllustratorUpdate: vi.fn(),
  mockNotify: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/queries/coloring/useBookPublishers', () => ({
  useBookPublishers: () => ({
    data: { items: [{ id: 'publisher-1', name: 'Acme', website_url: '' }] },
    isLoading: false,
  }),
}));
vi.mock('@/hooks/queries/coloring/useBookIllustrators', () => ({
  useBookIllustrators: () => ({
    data: { items: [{ id: 'illustrator-1', name: 'Acme' }] },
    isLoading: false,
  }),
}));
vi.mock('@/hooks/mutations/coloring/useCreateBookPublisher', () => ({
  useCreateBookPublisher: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/mutations/coloring/useCreateBookIllustrator', () => ({
  useCreateBookIllustrator: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/services/pocketbase/bookPublishers.service', () => ({
  BookPublishersService: { update: mockPublisherUpdate },
}));
vi.mock('@/services/pocketbase/bookIllustrators.service', () => ({
  BookIllustratorsService: { update: mockIllustratorUpdate },
}));
vi.mock('@/lib/notifications', () => ({ notify: mockNotify }));

import { BookTaxonomyListTab } from '../BookTaxonomyListTab';

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('BookTaxonomyListTab Stats cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPublisherUpdate.mockResolvedValue(undefined);
    mockIllustratorUpdate.mockResolvedValue(undefined);
  });

  it.each([
    { kind: 'publishers' as const, update: mockPublisherUpdate, recordId: 'publisher-1' },
    { kind: 'illustrators' as const, update: mockIllustratorUpdate, recordId: 'illustrator-1' },
  ])(
    'refreshes coloring collection Stats after renaming $kind',
    async ({ kind, update, recordId }) => {
      const client = makeClient();
      const collectionKey = queryKeys.stats.coloringCollection('user-1');
      const readCollection = vi.fn().mockResolvedValue({ topItems: ['Acme'] });
      await client.fetchQuery({
        queryKey: collectionKey,
        queryFn: readCollection,
        staleTime: Infinity,
      });

      const user = userEvent.setup();
      render(<BookTaxonomyListTab kind={kind} />, { wrapper: wrapper(client) });
      await user.click(screen.getByRole('button', { name: 'Edit Acme' }));
      await user.clear(screen.getByRole('textbox', { name: 'Name' }));
      await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Updated');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(update).toHaveBeenCalledWith(recordId, expect.objectContaining({ name: 'Updated' }))
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await client.fetchQuery({
        queryKey: collectionKey,
        queryFn: readCollection,
        staleTime: Infinity,
      });

      expect(readCollection).toHaveBeenCalledTimes(2);
      expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
    }
  );

  it('keeps a confirmed rename successful when Stats invalidation fails', async () => {
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockImplementationOnce(() => {
      throw new Error('Cache unavailable');
    });
    render(<BookTaxonomyListTab kind="publishers" />, { wrapper: wrapper(client) });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit Acme' }));
    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Updated');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockPublisherUpdate).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
    invalidate.mockRestore();
  });
});
