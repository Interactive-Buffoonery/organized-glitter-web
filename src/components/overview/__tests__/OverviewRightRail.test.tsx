import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OverviewRightRail } from '../OverviewRightRail';

const showUserReportDialog = vi.fn();

vi.mock('@/components/FeedbackDialogStore', () => ({
  showUserReportDialog: (...args: unknown[]) => showUserReportDialog(...args),
}));

const snapshot = {
  diamondActiveCount: 3,
  coloringPageInProgressCount: 8,
  completedThisMonthCount: 4,
};

const renderRail = (isLoading = false, verticals = { canUseDiamond: true, canUseColoring: true }) =>
  render(
    <MemoryRouter>
      <OverviewRightRail snapshot={snapshot} isLoading={isLoading} {...verticals} />
    </MemoryRouter>
  );

describe('OverviewRightRail', () => {
  it('renders quick links with the correct destinations', () => {
    renderRail();

    expect(screen.getByRole('link', { name: /Manage diamond paintings/ })).toHaveAttribute(
      'href',
      '/dashboard'
    );
    expect(screen.getByRole('link', { name: /Manage coloring books/ })).toHaveAttribute(
      'href',
      '/dashboard?craft=coloring'
    );
    expect(screen.getByRole('link', { name: /Import content/ })).toHaveAttribute(
      'href',
      '/profile?tab=data'
    );
    expect(screen.getByRole('link', { name: /Randomizer/ })).toHaveAttribute('href', '/randomizer');
    expect(screen.getByRole('link', { name: /Stats/ })).toHaveAttribute('href', '/stats');
  });

  it('renders snapshot labels and counts', () => {
    renderRail();

    expect(screen.getByText('Diamond paintings in progress')).toBeInTheDocument();
    expect(screen.getByText('Coloring pages in progress')).toBeInTheDocument();
    expect(screen.getByText('Completed this month')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renders loading skeletons instead of snapshot numbers', () => {
    const { container } = renderRail(true);

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('hides diamond quick links and snapshot rows when diamond painting is disabled', () => {
    renderRail(false, { canUseDiamond: false, canUseColoring: true });

    expect(
      screen.queryByRole('link', { name: /Manage diamond paintings/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Diamond paintings in progress')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Manage coloring books/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Import content/ })).toBeInTheDocument();
    expect(screen.getByText('Coloring pages in progress')).toBeInTheDocument();
  });

  it('opens the feedback dialog from the note link', async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(screen.getByRole('button', { name: 'please send me a message' }));

    expect(showUserReportDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPage: 'Overview - Right Rail',
      })
    );
  });
});
