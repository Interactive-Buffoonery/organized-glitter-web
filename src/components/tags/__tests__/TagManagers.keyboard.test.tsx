import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { InlineTagManager } from '@/components/tags/InlineTagManager';
import { ColoringBookTagManager } from '@/components/coloring/ColoringBookTagManager';
import type { Tag } from '@/types/tag';

const services = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.mock('@/services/pocketbase/tags.service', () => ({
  TagService: { getUserTags: services.list, createTag: services.create },
}));
vi.mock('@/services/pocketbase/coloringTags.service', () => ({
  ColoringTagService: { listColoringTags: services.list, createColoringTag: services.create },
}));

const flowers: Tag = {
  id: 'flowers',
  userId: 'test-user-id',
  name: 'flowers',
  slug: 'flowers',
  color: '#14b8a6',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  services.list.mockResolvedValue({ status: 'success', data: [flowers] });
  services.create.mockImplementation(async ({ name }: { name: string }) => ({
    status: 'success',
    data: { ...flowers, id: 'new-tag', name, slug: name },
  }));
});

describe.each(['diamond', 'coloring'] as const)('%s tag keyboard selection', craft => {
  const renderManager = () => {
    const onTagsChange = vi.fn();
    renderWithProviders(
      craft === 'diamond' ? (
        <InlineTagManager onTagsChange={onTagsChange} />
      ) : (
        <ColoringBookTagManager selectedTags={[]} onTagsChange={onTagsChange} />
      )
    );
    return onTagsChange;
  };

  it.each(['flowers', 'flow'])('selects highlighted existing tag for search %s', async search => {
    const onTagsChange = renderManager();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await screen.findByRole('option', { name: 'flowers' });
    await user.type(screen.getByRole('combobox'), search);
    await user.keyboard('{ArrowDown}{ArrowUp}');
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'flowers' })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    );
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onTagsChange).toHaveBeenCalledWith([flowers]));
    expect(services.create).not.toHaveBeenCalled();
  });

  it('selects an existing tag that arrives after the search is typed', async () => {
    let releaseTags!: (value: { status: 'success'; data: Tag[] }) => void;
    const pendingTags = new Promise<{ status: 'success'; data: Tag[] }>(resolve => {
      releaseTags = resolve;
    });
    services.list.mockReturnValue(pendingTags);
    const onTagsChange = renderManager();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.type(screen.getByRole('combobox'), 'flow');
    await waitFor(() => expect(services.list).toHaveBeenCalledWith({ search: 'flow' }));
    await act(async () => releaseTags({ status: 'success', data: [flowers] }));
    await screen.findByRole('option', { name: 'flowers' });
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}');
    await waitFor(() => expect(onTagsChange).toHaveBeenCalledWith([flowers]));
    expect(services.create).not.toHaveBeenCalled();
  });

  it('creates only when the explicit Create item is highlighted', async () => {
    const onTagsChange = renderManager();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await screen.findByRole('option', { name: 'flowers' });
    await user.type(screen.getByRole('combobox'), 'flow');
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Create "flow"' })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    );
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(onTagsChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'new-tag', name: 'flow' }),
      ])
    );
    expect(services.create).toHaveBeenCalledTimes(1);
  });
});
