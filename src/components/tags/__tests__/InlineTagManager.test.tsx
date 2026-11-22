import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import {
  describe,
  expect,
  it,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from '@/test-utils';
import type { Tag } from '@/types/tag';
import { InlineTagManager } from '../InlineTagManager';

const tagServiceMock = vi.hoisted(() => ({
  getUserTags: vi.fn(),
  createTag: vi.fn(),
}));

vi.mock('@/services/pocketbase/tags.service', () => ({ TagService: tagServiceMock }));

describe('InlineTagManager', () => {
  it('reuses an existing tag that differs only by case instead of creating one', async () => {
    const cats = { id: 'tag-cats', name: 'cats', color: '#888888' } as Tag;
    // The tag exists on the server but is missing from the loaded suggestions.
    let serverTags: Tag[] = [];
    tagServiceMock.getUserTags.mockImplementation(async () => ({
      status: 'success',
      data: serverTags,
    }));
    const onTagsChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<InlineTagManager onTagsChange={onTagsChange} />);

    await user.click(screen.getByRole('button', { name: /Add tag/ }));
    await user.type(screen.getByPlaceholderText('Search or create tags...'), 'CATS');
    const create = await screen.findByText(/Create "CATS"/);
    serverTags = [cats];
    await user.click(create);

    await waitFor(() => expect(onTagsChange).toHaveBeenLastCalledWith([cats]));
    expect(tagServiceMock.createTag).not.toHaveBeenCalled();
  });
});
