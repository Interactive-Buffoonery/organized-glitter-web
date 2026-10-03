import '@testing-library/jest-dom/vitest';
import type React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RandomizerControlsPanel, RandomizerCraftSelector } from '../RandomizerControlsPanel';
import type { RandomizerEligibility } from '@/types/randomizer';

const eligibility: RandomizerEligibility = {
  diamondStatuses: ['progress'],
  bookStatuses: ['in_progress'],
  pageStatuses: ['palette_chosen', 'in_progress'],
  ownership: 'owned',
};

const renderControls = (
  overrides: Partial<
    React.ComponentProps<typeof RandomizerControlsPanel> &
      React.ComponentProps<typeof RandomizerCraftSelector>
  > = {}
) => {
  const props: React.ComponentProps<typeof RandomizerControlsPanel> &
    React.ComponentProps<typeof RandomizerCraftSelector> = {
    mode: 'diamond',
    canUseDiamond: true,
    canUseColoring: true,
    eligibility,
    onModeChange: vi.fn(),
    onEligibilityChange: vi.fn(),
    onResetEligibility: vi.fn(),
    ...overrides,
  };

  render(
    <>
      <RandomizerCraftSelector {...props} />
      <RandomizerControlsPanel {...props} />
    </>
  );

  return props;
};

describe('RandomizerControlsPanel', () => {
  it('uses checked statuses as included and supports label and keyboard toggles', async () => {
    const user = userEvent.setup();
    const props = renderControls();
    expect(screen.getByRole('checkbox', { name: 'In progress' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Kitted up' })).not.toBeChecked();
    await user.click(screen.getByText('In progress'));
    expect(props.onEligibilityChange).toHaveBeenLastCalledWith({ diamondStatuses: [] });
    screen.getByRole('checkbox', { name: 'Kitted up' }).focus();
    await user.keyboard('[Space]');
    expect(props.onEligibilityChange).toHaveBeenLastCalledWith({
      diamondStatuses: ['progress', 'kitted'],
    });
  });
  it('allows mobile craft labels to wrap while preserving accessible names', () => {
    renderControls();

    expect(screen.getByRole('button', { name: 'Diamond paintings' })).toHaveClass(
      'whitespace-normal'
    );
    expect(screen.getByRole('button', { name: 'Coloring books' })).toHaveClass('whitespace-normal');
    expect(screen.getByRole('button', { name: 'Coloring pages' })).toHaveClass('whitespace-normal');
  });

  it('calls onModeChange when selecting coloring pages', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    renderControls({ onModeChange });

    await user.click(screen.getByRole('button', { name: 'Coloring pages' }));

    expect(onModeChange).toHaveBeenCalledWith('coloring-page');
  });

  it('uses bookshelf copy for the coloring book not-started status filter', () => {
    renderControls({ mode: 'coloring-book' });

    expect(
      screen.getByRole('checkbox', { name: 'On Bookshelf (Not Started)' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'In stash' })).not.toBeInTheDocument();
  });
});
