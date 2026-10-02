import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OverviewSortControl } from '../OverviewSortControl';

const mockCapture = vi.fn();

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

describe('OverviewSortControl', () => {
  it('renders the current sort label', () => {
    render(<OverviewSortControl value="name_asc" onValueChange={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Sort activity by Name A to Z' })
    ).toBeInTheDocument();
  });

  it('opens the option list', async () => {
    const user = userEvent.setup();
    render(<OverviewSortControl value="recent_activity" onValueChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Sort activity by Recent activity' }));

    expect(screen.getByRole('radiogroup', { name: 'Sort activity' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Oldest activity/ })).toBeInTheDocument();
  });

  it('marks the active option', async () => {
    const user = userEvent.setup();
    render(<OverviewSortControl value="oldest_activity" onValueChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Sort activity by Oldest activity' }));

    expect(screen.getByRole('radio', { name: /Oldest activity/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('calls onValueChange with the selected sort id', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<OverviewSortControl value="recent_activity" onValueChange={onValueChange} />);

    await user.click(screen.getByRole('button', { name: 'Sort activity by Recent activity' }));
    await user.click(screen.getByRole('radio', { name: /Name Z to A/ }));

    expect(onValueChange).toHaveBeenCalledWith('name_desc');
    expect(mockCapture).toHaveBeenCalledWith('overview_sort_changed', {
      surface: 'overview',
      sort_field: 'name_desc',
    });
  });
});
