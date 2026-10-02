import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithProviders, screen } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import DashboardStatusSegments from '../DashboardStatusSegments';

const mockCapture = vi.fn();

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}));

describe('DashboardStatusSegments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all statuses with accessible count labels', () => {
    renderWithProviders(
      <DashboardStatusSegments
        activeStatus="everything"
        displayedCounts={{
          everything: 18,
          wishlist: 2,
          purchased: 3,
          stash: 4,
          kitted: 1,
          progress: 2,
          onhold: 1,
          completed: 3,
          archived: 1,
          destashed: 1,
        }}
        isLoadingCounts={false}
        hasCountError={false}
        onStatusChange={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'All, 18 kits' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Kitted Up, 1 kit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archived, 1 kit' })).toBeInTheDocument();
  });

  it('fires status change and analytics on click', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();

    renderWithProviders(
      <DashboardStatusSegments
        activeStatus="everything"
        displayedCounts={{
          everything: 8,
          wishlist: 1,
          purchased: 1,
          stash: 1,
          kitted: 1,
          progress: 1,
          onhold: 1,
          completed: 1,
          archived: 1,
          destashed: 0,
        }}
        isLoadingCounts={false}
        hasCountError={false}
        onStatusChange={onStatusChange}
      />
    );

    await user.click(screen.getByTestId('status-chip-progress'));

    expect(onStatusChange).toHaveBeenCalledWith('progress');
    expect(mockCapture).toHaveBeenCalledWith('dashboard_status_segment_clicked', {
      status: 'progress',
      count: 1,
    });
  });

  it('supports arrow key navigation and keyboard activation', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();

    renderWithProviders(
      <DashboardStatusSegments
        activeStatus="everything"
        displayedCounts={{
          everything: 10,
          wishlist: 2,
          purchased: 2,
          stash: 2,
          kitted: 1,
          progress: 1,
          onhold: 1,
          completed: 1,
          archived: 0,
          destashed: 0,
        }}
        isLoadingCounts={false}
        hasCountError={false}
        onStatusChange={onStatusChange}
      />
    );

    const allButton = screen.getByTestId('status-chip-everything');
    const wishlistButton = screen.getByTestId('status-chip-wishlist');

    allButton.focus();
    fireEvent.keyDown(allButton, { key: 'ArrowRight' });
    expect(wishlistButton).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onStatusChange).toHaveBeenCalledWith('wishlist');
  });

  it('keeps chips interactive when counts are unavailable', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();

    renderWithProviders(
      <DashboardStatusSegments
        activeStatus="everything"
        displayedCounts={{
          everything: 0,
          wishlist: 0,
          purchased: 0,
          stash: 0,
          kitted: 0,
          progress: 0,
          onhold: 0,
          completed: 0,
          archived: 0,
          destashed: 0,
        }}
        isLoadingCounts={false}
        hasCountError={true}
        onStatusChange={onStatusChange}
      />
    );

    const archivedChip = screen.getByRole('button', { name: 'Archived' });
    await user.click(archivedChip);

    expect(onStatusChange).toHaveBeenCalledWith('archived');
    expect(mockCapture).toHaveBeenCalledWith('dashboard_status_segment_clicked', {
      status: 'archived',
      count: null,
    });
  });
});
