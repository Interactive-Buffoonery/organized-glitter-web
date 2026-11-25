/**
 * EditTagDialog must send each tag to the update hook for its own vocabulary.
 * Coloring tags live in a separate collection, so routing a coloring tag to the
 * diamond update path fails with "Tag not found or access denied".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditTagDialog from '../EditTagDialog';
import type { Tag } from '@/types/tag';

const updateDiamondTagMock = vi.hoisted(() => vi.fn());
const updateColoringTagMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/mutations/useUpdateTag', () => ({
  useUpdateTag: () => ({ mutate: updateDiamondTagMock, isPending: false }),
}));

vi.mock('@/hooks/mutations/coloring/useUpdateColoringTag', () => ({
  useUpdateColoringTag: () => ({ mutate: updateColoringTagMock, isPending: false }),
}));

const tag: Tag = {
  id: 'tag-1',
  userId: 'user-1',
  name: 'cozy',
  slug: 'cozy',
  color: '#3B82F6',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const renameTo = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Edit cozy' }));
  fireEvent.change(screen.getByLabelText(/Tag Name/), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Update Tag' }));
};

describe('EditTagDialog vocabulary routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates coloring tags through the coloring tag hook', () => {
    render(<EditTagDialog tag={tag} vocabulary="coloring" />);

    renameTo('snug');

    expect(updateColoringTagMock).toHaveBeenCalledWith(
      { id: 'tag-1', updates: { name: 'snug', color: '#3B82F6' } },
      expect.any(Object)
    );
    expect(updateDiamondTagMock).not.toHaveBeenCalled();
  });

  it('keeps diamond tags on the diamond tag hook by default', () => {
    render(<EditTagDialog tag={tag} />);

    renameTo('snug');

    expect(updateDiamondTagMock).toHaveBeenCalledWith(
      { id: 'tag-1', updates: { name: 'snug', color: '#3B82F6' } },
      expect.any(Object)
    );
    expect(updateColoringTagMock).not.toHaveBeenCalled();
  });
});
