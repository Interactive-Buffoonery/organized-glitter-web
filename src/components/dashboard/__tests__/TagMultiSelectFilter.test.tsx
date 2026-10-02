import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test-utils';
import TagMultiSelectFilter from '../TagMultiSelectFilter';

const OPTIONS = [
  { label: 'Fantasy', value: 'tag-fantasy' },
  { label: 'Garden', value: 'tag-garden' },
  { label: 'Holiday', value: 'tag-holiday' },
];

const Harness = () => {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  return (
    <div>
      <TagMultiSelectFilter
        label="Tags"
        options={OPTIONS}
        selectedValues={selectedTags}
        onChange={setSelectedTags}
      />
      <span data-testid="selected-tags">{selectedTags.join(',')}</span>
    </div>
  );
};

describe('TagMultiSelectFilter', () => {
  it('supports multi-selection in the desktop popover', async () => {
    const user = userEvent.setup();

    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Tags filter. No tags selected.' }));
    expect(screen.getByRole('checkbox', { name: 'Fantasy' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Fantasy' }));
    expect(screen.getByTestId('selected-tags')).toHaveTextContent('tag-fantasy');

    await user.click(screen.getByRole('checkbox', { name: 'Garden' }));
    expect(screen.getByTestId('selected-tags')).toHaveTextContent('tag-fantasy,tag-garden');
    expect(screen.getByTestId('tag-multi-select-trigger')).toHaveTextContent('Fantasy, Garden');
  });

  it('supports multi-selection in the mobile inline list', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <div>
        <TagMultiSelectFilter
          label="Tags"
          options={OPTIONS}
          selectedValues={[]}
          onChange={() => {}}
          inline
        />
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'Tags filter. No tags selected.' }));
    expect(screen.getByText('Choose one or more tags')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Fantasy' })).toBeInTheDocument();
  });
});
