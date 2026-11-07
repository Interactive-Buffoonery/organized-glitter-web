import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { OverviewActivityList } from '../OverviewActivityList';
import type { OverviewFeedItem } from '@/services/pocketbase/overview.service';

const item: OverviewFeedItem = {
  id: 'kit',
  key: 'kit',
  kind: 'diamond-project',
  craft: 'diamond',
  title: 'Summer Garden',
  subtitle: 'Example maker',
  thumbnailUrl: null,
  statusLabel: 'In progress',
  statusTone: 'progress',
  activityLabel: 'Updated today',
  href: '/projects/kit',
  sortAt: '',
  sortTitle: 'Summer Garden',
};

const show = (items: OverviewFeedItem[]) =>
  render(
    <MemoryRouter>
      <OverviewActivityList
        items={items}
        activeCraftFilter="all"
        isLoading={false}
        isError={false}
        onRetry={() => {}}
      />
    </MemoryRouter>
  );

describe('Overview activity clarity', () => {
  it('keeps activity beside project identity without repeating section status', () => {
    show([item]);
    expect(screen.getByRole('link', { name: /Summer Garden/ })).toHaveTextContent('Updated today');
    expect(screen.queryByText('In progress')).not.toBeInTheDocument();
    expect(screen.queryByText('Open')).not.toBeInTheDocument();
  });
  it('offers a route to the library when nothing is active', () => {
    show([]);
    expect(screen.getByRole('link', { name: 'Browse your library' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });
});
