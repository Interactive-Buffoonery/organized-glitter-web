import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/hooks/queries/queryKeys';
import type { Tag } from '@/types/tag';

const services = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/services/pocketbase/tags.service', () => ({
  TagService: {
    getUserTags: services.list,
    addTagToProject: services.add,
    removeTagFromProject: services.remove,
  },
}));
vi.mock('@/lib/notifications', () => ({ notify: vi.fn() }));

import { InlineTagManager } from '../InlineTagManager';

const flowers: Tag = {
  id: 'flowers',
  userId: 'user-1',
  name: 'flowers',
  slug: 'flowers',
  color: '#14b8a6',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

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

async function seedCollection(client: QueryClient) {
  const queryKey = queryKeys.stats.collection('user-1');
  const read = vi.fn().mockResolvedValue({ topTags: [] });
  await client.fetchQuery({ queryKey, queryFn: read, staleTime: Infinity });
  return async () => {
    await client.fetchQuery({ queryKey, queryFn: read, staleTime: Infinity });
    return read.mock.calls.length;
  };
}

describe('InlineTagManager Stats cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    services.list.mockResolvedValue({ status: 'success', data: [flowers] });
    services.add.mockResolvedValue({ status: 'success' });
    services.remove.mockResolvedValue({ status: 'success' });
  });

  it('refreshes collection Stats after adding a tag to a saved project', async () => {
    const client = makeClient();
    const readCollection = await seedCollection(client);
    const user = userEvent.setup();
    render(<InlineTagManager projectId="project-1" />, { wrapper: wrapper(client) });

    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(await screen.findByRole('option', { name: 'flowers' }));
    await waitFor(() => expect(services.add).toHaveBeenCalledWith('project-1', 'flowers'));

    expect(await readCollection()).toBe(2);
  });

  it('refreshes collection Stats after removing a tag from a saved project', async () => {
    const client = makeClient();
    const readCollection = await seedCollection(client);
    const user = userEvent.setup();
    render(<InlineTagManager projectId="project-1" initialTags={[flowers]} />, {
      wrapper: wrapper(client),
    });

    await user.click(screen.getByRole('button', { name: 'Remove flowers tag' }));
    await waitFor(() => expect(services.remove).toHaveBeenCalledWith('project-1', 'flowers'));

    expect(await readCollection()).toBe(2);
  });

  it('keeps Stats cached when adding a tag fails', async () => {
    const client = makeClient();
    const readCollection = await seedCollection(client);
    services.add.mockResolvedValue({ status: 'error', error: { message: 'save failed' } });
    const user = userEvent.setup();
    render(<InlineTagManager projectId="project-1" />, { wrapper: wrapper(client) });

    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(await screen.findByRole('option', { name: 'flowers' }));
    await waitFor(() => expect(services.add).toHaveBeenCalledWith('project-1', 'flowers'));

    expect(await readCollection()).toBe(1);
  });

  it('keeps Stats cached for unsaved form-only tag selection', async () => {
    const client = makeClient();
    const readCollection = await seedCollection(client);
    const user = userEvent.setup();
    render(<InlineTagManager />, { wrapper: wrapper(client) });

    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(await screen.findByRole('option', { name: 'flowers' }));

    expect(services.add).not.toHaveBeenCalled();
    expect(await readCollection()).toBe(1);
  });
});
