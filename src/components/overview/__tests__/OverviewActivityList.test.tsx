import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OverviewActivityList } from '../OverviewActivityList';
import type { OverviewFeedItem } from '@/services/pocketbase/overview.service';

const ITEMS: OverviewFeedItem[] = [
  {
    id: 'project-1',
    key: 'diamond-project-1',
    kind: 'diamond-project',
    craft: 'diamond',
    title: 'Moonlit Greenhouse',
    subtitle: 'Diamond painting · Starshine Studio',
    thumbnailUrl: null,
    statusLabel: 'In progress',
    statusTone: 'progress',
    activityLabel: 'Last progress note Apr 28',
    href: '/projects/project-1',
    sortAt: '2026-04-28',
    sortTitle: 'Moonlit Greenhouse',
  },
  {
    id: 'page-1',
    key: 'coloring-page-1',
    kind: 'coloring-page',
    craft: 'coloring',
    title: 'Page 12',
    subtitle: 'Coloring · Woodland Windows',
    thumbnailUrl: null,
    statusLabel: 'In progress',
    statusTone: 'progress',
    activityLabel: '42% complete',
    href: '/coloring/book-1/pages/page-1',
    sortAt: '2026-04-26',
    sortTitle: 'Woodland Windows 12',
  },
];

const renderList = (override?: Partial<React.ComponentProps<typeof OverviewActivityList>>) =>
  render(
    <MemoryRouter>
      <OverviewActivityList
        items={ITEMS}
        activeCraftFilter="all"
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        {...override}
      />
    </MemoryRouter>
  );

describe('OverviewActivityList', () => {
  it('uses the same visible Open action for both crafts', () => {
    renderList();
    expect(screen.getAllByText('Open', { exact: true })).toHaveLength(2);
    expect(screen.queryByText('Open page', { exact: true })).not.toBeInTheDocument();
  });

  it('renders the desktop column labels and mixed rows', () => {
    renderList();

    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('Moonlit Greenhouse')).toBeInTheDocument();
    expect(screen.getByText('Page 12')).toBeInTheDocument();
  });

  it('links every row to its destination', () => {
    renderList();

    expect(screen.getByRole('link', { name: 'Open Moonlit Greenhouse' })).toHaveAttribute(
      'href',
      '/projects/project-1'
    );
    expect(screen.getByRole('link', { name: 'Open Page 12' })).toHaveAttribute(
      'href',
      '/coloring/book-1/pages/page-1'
    );
  });

  it('renders activity rows as list items without changing row destinations', () => {
    renderList();

    const list = screen.getByRole('list');
    const rows = within(list).getAllByRole('listitem');

    expect(screen.getAllByRole('list')).toHaveLength(1);
    expect(rows).toHaveLength(ITEMS.length);
    expect(within(rows[0]).getByRole('link', { name: 'Open Moonlit Greenhouse' })).toHaveAttribute(
      'href',
      '/projects/project-1'
    );
    expect(within(rows[1]).getByRole('link', { name: 'Open Page 12' })).toHaveAttribute(
      'href',
      '/coloring/book-1/pages/page-1'
    );
  });

  it('renders filter-specific empty states', () => {
    const { rerender } = renderList({ items: [], activeCraftFilter: 'all' });

    expect(screen.getByText('Nothing is in progress right now.')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <OverviewActivityList
          items={[]}
          activeCraftFilter="coloring"
          isLoading={false}
          isError={false}
          onRetry={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('No coloring pages in progress right now.')).toBeInTheDocument();
  });

  it('calls onRetry from the error state', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderList({ items: [], isError: true, onRetry });

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalled();
  });

  it('announces skeleton loading as a busy status region', () => {
    renderList({ items: [], isLoading: true });

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Loading overview activity');
  });
});
