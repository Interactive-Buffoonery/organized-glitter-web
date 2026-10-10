import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { enabledVerticalsState } = vi.hoisted(() => ({
  enabledVerticalsState: {
    diamond_painting: true,
    coloring_books: true,
    isLoading: false,
  },
}));

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
}));

vi.mock('@/hooks/useEnabledVerticals', () => ({
  useEnabledVerticals: () => enabledVerticalsState,
}));

import { ManageListHeader, ManageListsLayout } from '../ManageListsLayout';

const renderAt = (path: string, children?: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ManageListsLayout>{children}</ManageListsLayout>
    </MemoryRouter>
  );

describe('ManageListsLayout', () => {
  beforeEach(() => {
    enabledVerticalsState.diamond_painting = true;
    enabledVerticalsState.coloring_books = true;
    enabledVerticalsState.isLoading = false;
  });

  it('lists every enabled list in one navigation grouped by craft', () => {
    renderAt('/options/companies');

    const nav = screen.getByRole('navigation', { name: 'Lists' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Diamond painting' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Coloring' })).toBeInTheDocument();
    for (const [name, href] of [
      ['Companies', '/options/companies'],
      ['Artists', '/options/artists'],
      ['Tags', '/options/tags'],
      ['Publishers', '/options/publishers'],
      ['Illustrators', '/options/illustrators'],
      ['Coloring mediums', '/options/coloring-mediums'],
    ]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it('marks the current list in the navigation', () => {
    renderAt('/options/publishers');

    expect(screen.getByRole('link', { name: 'Publishers' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Companies' })).not.toHaveAttribute('aria-current');
  });

  it('hides lists for disabled crafts', () => {
    enabledVerticalsState.coloring_books = false;

    renderAt('/options/companies');

    expect(screen.queryByRole('heading', { name: 'Coloring' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Publishers' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Companies' })).toBeInTheDocument();
  });

  it('does not show list links while craft preferences load', () => {
    enabledVerticalsState.isLoading = true;

    renderAt('/options');

    expect(screen.getByText('Loading lists…')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Companies' })).not.toBeInTheDocument();
  });

  it('uses one Manage Lists page heading and renders the selected list', () => {
    renderAt('/options/tags', <ManageListHeader title="Tags" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Manage Lists' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Tags' })).toBeInTheDocument();
  });

  it('offers a way back to all lists from a list page', () => {
    renderAt('/options/tags');

    expect(screen.getByRole('link', { name: 'All lists' })).toHaveAttribute('href', '/options');
  });

  it('does not offer a back link on the lists index', () => {
    renderAt('/options');

    expect(screen.queryByRole('link', { name: 'All lists' })).not.toBeInTheDocument();
  });
});
