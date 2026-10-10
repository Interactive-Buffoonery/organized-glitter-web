/**
 * Regression: TagTable "N projects" links must carry the tag ID, not the name.
 *
 * projects.service.ts filters tags via `project_tags_via_project.tag ?= {:tagId}`,
 * which only matches on the tag relation's ID. Before the fix, the link generated
 * `?tag=<name>` which silently returned zero projects on the dashboard; the link
 * looked like it worked but delivered an empty view.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TagTable from '../TagTable';
import type { Tag } from '@/types/tag';

const deleteTagMutateMock = vi.hoisted(() => vi.fn());
const deleteColoringTagMutateMock = vi.hoisted(() => vi.fn());
const refetchTagStatsMock = vi.hoisted(() => vi.fn());
const refetchColoringTagStatsMock = vi.hoisted(() => vi.fn());
const tagStatsState = vi.hoisted(() => ({
  data: { 'tag-id-xyz': 3 } as Record<string, number>,
  isLoading: false,
  error: null as Error | null,
}));
const coloringTagStatsState = vi.hoisted(() => ({
  data: { 'coloring-tag-id-abc': 2 } as Record<string, number>,
  isLoading: false,
  error: null as Error | null,
}));

vi.mock('@/hooks/mutations/useDeleteTag', () => ({
  useDeleteTag: () => ({ mutate: deleteTagMutateMock, isPending: false }),
}));

vi.mock('@/hooks/mutations/coloring/useDeleteColoringTag', () => ({
  useDeleteColoringTag: () => ({ mutate: deleteColoringTagMutateMock, isPending: false }),
}));

vi.mock('@/hooks/queries/useTagStats', () => ({
  useTagStats: () => ({
    ...tagStatsState,
    refetch: refetchTagStatsMock,
  }),
}));

vi.mock('@/hooks/queries/coloring/useColoringTagStats', () => ({
  useColoringTagStats: () => ({
    ...coloringTagStatsState,
    refetch: refetchColoringTagStatsMock,
  }),
}));

vi.mock('@/utils/logger', () => ({
  logger: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createLogger: () => ({
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../EditTagDialog', () => ({
  default: () => null,
}));

const mockTag: Tag = {
  id: 'tag-id-xyz',
  userId: 'user-1',
  name: 'landscape',
  slug: 'landscape',
  color: '#3B82F6',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockColoringTag: Tag = {
  id: 'coloring-tag-id-abc',
  userId: 'user-1',
  name: 'cozy',
  slug: 'cozy',
  color: '#14b8a6',
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

describe('TagTable dashboard link', () => {
  it('displays hex colors in uppercase without changing tag data', () => {
    render(
      <MemoryRouter>
        <TagTable
          tags={[{ ...mockTag, color: '#14b8a6' }]}
          coloringTags={[mockColoringTag]}
          loading={false}
        />
      </MemoryRouter>
    );
    expect(screen.getAllByText('#14B8A6')).toHaveLength(2);
    expect(mockColoringTag.color).toBe('#14b8a6');
  });

  beforeEach(() => {
    deleteTagMutateMock.mockClear();
    deleteColoringTagMutateMock.mockClear();
    refetchTagStatsMock.mockClear();
    refetchColoringTagStatsMock.mockClear();
    Object.assign(tagStatsState, {
      data: { 'tag-id-xyz': 3 },
      isLoading: false,
      error: null,
    });
    Object.assign(coloringTagStatsState, {
      data: { 'coloring-tag-id-abc': 2 },
      isLoading: false,
      error: null,
    });
  });

  it('links "N projects" to /dashboard with the tag ID, not the tag name', () => {
    render(
      <MemoryRouter>
        <TagTable tags={[mockTag]} coloringTags={[mockColoringTag]} loading={false} />
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: /projects?$/i });
    const href = link.getAttribute('href') || '';

    expect(href).toBe('/dashboard?tag=tag-id-xyz');
    expect(href).not.toContain('landscape');
  });

  it('shows split diamond project and coloring book usage counts', () => {
    render(
      <MemoryRouter>
        <TagTable tags={[mockTag]} coloringTags={[mockColoringTag]} loading={false} />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /3 diamond projects/i })).toHaveAttribute(
      'href',
      '/dashboard?tag=tag-id-xyz'
    );
    expect(screen.getByRole('link', { name: /2 coloring books/i })).toHaveAttribute(
      'href',
      '/dashboard?craft=coloring&tags=coloring-tag-id-abc'
    );
  });

  it('allows deleting coloring tags that are assigned to books after warning', () => {
    render(
      <MemoryRouter>
        <TagTable tags={[mockTag]} coloringTags={[mockColoringTag]} loading={false} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete cozy' }));

    expect(screen.getByText(/remove it from those books first/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));

    expect(deleteColoringTagMutateMock).toHaveBeenCalledWith(
      { id: 'coloring-tag-id-abc', name: 'cozy' },
      expect.objectContaining({ onSettled: expect.any(Function) })
    );
    expect(deleteTagMutateMock).not.toHaveBeenCalled();
  });

  it('keeps coloring counts when diamond tag usage fails and retries it', () => {
    tagStatsState.error = new Error('diamond stats unavailable');

    render(
      <MemoryRouter>
        <TagTable tags={[mockTag]} coloringTags={[mockColoringTag]} loading={false} />
      </MemoryRouter>
    );

    expect(screen.getByText('Diamond project tag usage is unavailable.')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2 coloring books/i })).toBeInTheDocument();
    expect(screen.queryByText('No usage')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry diamond tag usage' }));

    expect(refetchTagStatsMock).toHaveBeenCalledOnce();
    expect(refetchColoringTagStatsMock).not.toHaveBeenCalled();
  });

  it('keeps diamond counts when coloring tag usage fails and retries it', () => {
    coloringTagStatsState.error = new Error('coloring stats unavailable');

    render(
      <MemoryRouter>
        <TagTable tags={[mockTag]} coloringTags={[mockColoringTag]} loading={false} />
      </MemoryRouter>
    );

    expect(screen.getByText('Coloring book tag usage is unavailable.')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /3 diamond projects/i })).toBeInTheDocument();
    expect(screen.queryByText('No usage')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry coloring tag usage' }));

    expect(refetchColoringTagStatsMock).toHaveBeenCalledOnce();
    expect(refetchTagStatsMock).not.toHaveBeenCalled();
  });
});
