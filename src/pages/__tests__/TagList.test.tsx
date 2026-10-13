import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tag } from '@/types/tag';
import { createErrorResponse, createSuccessResponse, type ServiceResponse } from '@/types/shared';

const mocks = vi.hoisted(() => ({ listColoringTags: vi.fn(), diamondTags: [] as Tag[] }));
vi.mock('@/services/pocketbase/coloringTags.service', () => ({
  ColoringTagService: { listColoringTags: mocks.listColoringTags },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-123' } }) }));
vi.mock('@/hooks/useAppReady', () => ({ useAppReady: vi.fn() }));
vi.mock('@/contexts/MetadataContext', () => ({
  useMetadata: () => ({ tags: mocks.diamondTags, isLoading: { tags: false }, error: {} }),
}));
vi.mock('@/components/manage-lists/ManageListsLayout', () => ({
  ManageListsLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/components/tags/TagPageHeader', () => ({ default: () => <h1>Tags</h1> }));
// Isolate page query states from unrelated mutation and usage-count queries in the table.
vi.mock('@/components/tags/TagTable', () => ({
  default: ({
    tags,
    coloringTags,
    loading,
  }: {
    tags: Tag[];
    coloringTags: Tag[];
    loading: boolean;
  }) =>
    loading ? (
      <p>Table loading</p>
    ) : tags.length + coloringTags.length ? (
      <ul>
        {[...tags, ...coloringTags].map(tag => (
          <li key={tag.id}>{tag.name}</li>
        ))}
      </ul>
    ) : (
      <p>You haven't created any tags yet.</p>
    ),
}));

import TagList from '../TagList';

const tag = (id: string, name: string): Tag => ({
  id,
  name,
  userId: 'user-123',
  slug: id,
  color: '#14b8a6',
  createdAt: '',
  updatedAt: '',
});
const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <TagList />
    </QueryClientProvider>
  );
};

describe('TagList coloring tag recovery', () => {
  beforeEach(() => {
    mocks.listColoringTags.mockReset();
    mocks.diamondTags = [tag('diamond-1', 'Sparkle')];
  });

  it('shows a coloring error while retaining diamond tags and retries with the keyboard', async () => {
    let resolveRetry!: (result: ServiceResponse<Tag[]>) => void;
    mocks.listColoringTags
      .mockResolvedValueOnce(createErrorResponse(new Error('Offline')))
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveRetry = resolve;
          })
      );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load coloring tags');
    expect(screen.getByText('Sparkle')).toBeVisible();
    await user.tab();
    const retry = screen.getByRole('button', { name: 'Retry coloring tags' });
    expect(retry).toHaveFocus();
    expect(retry).toHaveAttribute('type', 'button');
    await user.keyboard('{Enter}');

    expect(mocks.listColoringTags).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('status')).toHaveTextContent('Loading coloring tags');
    expect(screen.queryByRole('button', { name: 'Retry coloring tags' })).not.toBeInTheDocument();
    expect(screen.getByText('Sparkle')).toBeVisible();
    await act(async () => {
      resolveRetry(createSuccessResponse([tag('coloring-1', 'Cozy')]));
    });
    expect(await screen.findByText('Cozy')).toBeVisible();
    expect(screen.getByText('Sparkle')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not describe a failed coloring request as an empty tag library', async () => {
    mocks.diamondTags = [];
    mocks.listColoringTags.mockResolvedValue(createErrorResponse(new Error('Offline')));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load coloring tags');
    expect(screen.queryByText("You haven't created any tags yet.")).not.toBeInTheDocument();
  });

  it('announces initial coloring loading without hiding available diamond tags', async () => {
    mocks.listColoringTags.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading coloring tags');
    expect(screen.getByText('Sparkle')).toBeVisible();
  });
});
