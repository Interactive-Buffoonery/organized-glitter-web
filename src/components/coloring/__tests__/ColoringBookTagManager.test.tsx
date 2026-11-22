import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
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
import { ColoringBookTagManager } from '../ColoringBookTagManager';

const coloringTagsServiceMock = vi.hoisted(() => ({
  listColoringTags: vi.fn(),
  createColoringTag: vi.fn(),
}));

vi.mock('@/services/pocketbase/coloringTags.service', () => ({
  ColoringTagService: coloringTagsServiceMock,
}));

const tag = (id: string, name: string) => ({ id, name, color: '#888888' }) as Tag;

function Harness({ initialTags }: { initialTags: Tag[] }) {
  const [tags, setTags] = useState(initialTags);
  return (
    <>
      <ColoringBookTagManager selectedTags={tags} onTagsChange={setTags} />
      <output data-testid="selected">{tags.map(t => t.name).join(',')}</output>
    </>
  );
}

describe('ColoringBookTagManager', () => {
  it('locks tag edits until a new tag is created so none are lost', async () => {
    let resolveCreate: (value: unknown) => void = () => {};
    coloringTagsServiceMock.listColoringTags.mockResolvedValue({ status: 'success', data: [] });
    coloringTagsServiceMock.createColoringTag.mockReturnValue(
      new Promise(resolve => {
        resolveCreate = resolve;
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness initialTags={[tag('a', 'Animals'), tag('b', 'Botanical')]} />);

    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.type(screen.getByPlaceholderText('Search or create tags...'), 'Mandala');
    await user.click(await screen.findByText(/Create "Mandala"/));

    expect(screen.queryByRole('button', { name: 'Remove Animals tag' })).not.toBeInTheDocument();

    resolveCreate({ status: 'success', data: tag('c', 'Mandala') });

    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('Mandala'));
    expect(screen.getByTestId('selected')).toHaveTextContent(/^Animals,Botanical,Mandala$/);
    expect(screen.getByRole('button', { name: 'Remove Animals tag' })).toBeInTheDocument();
  });

  it('ignores picks when the parent locks tags while the picker is open', async () => {
    coloringTagsServiceMock.createColoringTag.mockClear();
    coloringTagsServiceMock.listColoringTags.mockResolvedValue({
      status: 'success',
      data: [tag('b', 'Botanical')],
    });
    const onTagsChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <ColoringBookTagManager selectedTags={[]} onTagsChange={onTagsChange} />
    );

    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    const existing = await screen.findByText('Botanical');
    rerender(<ColoringBookTagManager selectedTags={[]} disabled onTagsChange={onTagsChange} />);

    await user.click(existing);
    expect(onTagsChange).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText('Search or create tags...'), 'Mandala');
    await user.click(await screen.findByText(/Create "Mandala"/));

    expect(onTagsChange).not.toHaveBeenCalled();
    expect(coloringTagsServiceMock.createColoringTag).not.toHaveBeenCalled();
  });

  it('reuses an existing tag that differs only by case instead of creating one', async () => {
    coloringTagsServiceMock.createColoringTag.mockClear();
    // The tag exists on the server but is missing from the loaded suggestions.
    let serverTags: Tag[] = [];
    coloringTagsServiceMock.listColoringTags.mockImplementation(async () => ({
      status: 'success',
      data: serverTags,
    }));
    const user = userEvent.setup();
    renderWithProviders(<Harness initialTags={[]} />);

    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.type(screen.getByPlaceholderText('Search or create tags...'), 'CATS');
    const create = await screen.findByText(/Create "CATS"/);
    serverTags = [tag('c', 'cats')];
    await user.click(create);

    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent(/^cats$/));
    expect(coloringTagsServiceMock.createColoringTag).not.toHaveBeenCalled();
  });
});
