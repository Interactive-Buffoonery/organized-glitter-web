import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OverviewCraftTabs } from '../OverviewCraftTabs';

const mockCapture = vi.fn();

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}));

describe('OverviewCraftTabs', () => {
  it('renders the three overview craft filters', () => {
    render(<OverviewCraftTabs value="all" canUseDiamond canUseColoring onValueChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diamond paintings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coloring pages' })).toBeInTheDocument();
  });

  it('marks the active filter with aria-pressed', () => {
    render(
      <OverviewCraftTabs value="coloring" canUseDiamond canUseColoring onValueChange={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: 'Coloring pages' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onValueChange when a filter is selected', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <OverviewCraftTabs value="all" canUseDiamond canUseColoring onValueChange={onValueChange} />
    );

    await user.click(screen.getByRole('button', { name: 'Diamond paintings' }));

    expect(onValueChange).toHaveBeenCalledWith('diamond');
    expect(mockCapture).toHaveBeenCalledWith('overview_craft_filter_changed', {
      surface: 'overview',
      from_craft: 'all',
      to_craft: 'diamond',
    });
  });

  it('hides diamond filtering when diamond painting is disabled', () => {
    render(
      <OverviewCraftTabs
        value="coloring"
        canUseDiamond={false}
        canUseColoring
        onValueChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'Diamond paintings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
  });
});
