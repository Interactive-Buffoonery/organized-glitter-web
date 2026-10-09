import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, act, fireEvent } from '@testing-library/react';

const { authState } = vi.hoisted(() => ({
  authState: {
    user: { id: 'u1', email: 'test@example.com' } as {
      id: string;
      email: string;
      name?: string;
      username?: string;
      avatar?: string;
    } | null,
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('../AuthMenu', () => ({
  AuthMenu: ({ avatarConfig: _a, userName: _u, userEmail: _e }: Record<string, unknown>) => (
    <button type="button">Account menu</button>
  ),
}));

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => <button type="button">Toggle theme</button>,
}));

import { SiteHeader } from '../SiteHeader';

beforeEach(() => {
  authState.user = { id: 'u1', email: 'test@example.com' };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SiteHeader', () => {
  it('keeps sticky app chrome inside the top safe area', () => {
    render(
      <MemoryRouter>
        <SiteHeader currentPage="Overview" />
      </MemoryRouter>
    );

    expect(screen.getByRole('banner', { name: 'Site header' })).toHaveClass(
      'site-header-safe-area',
      'sticky',
      'top-0'
    );
    expect(screen.getByText('Organized Glitter')).toBeInTheDocument();
  });

  it('keeps visible mobile chrome before the user scrolls', () => {
    render(
      <MemoryRouter>
        <SiteHeader currentPage="Overview" />
      </MemoryRouter>
    );

    expect(screen.getByRole('banner', { name: 'Site header' })).toHaveClass(
      'bg-background/90',
      'border-b',
      'backdrop-blur-md',
      'sm:bg-transparent'
    );
  });

  it('keeps the home link semantic and large enough for mobile touch', () => {
    render(
      <MemoryRouter>
        <SiteHeader currentPage="Overview" />
      </MemoryRouter>
    );

    const homeLink = screen.getByRole('link', { name: 'Organized Glitter home' });
    expect(homeLink).toHaveAttribute('href', '/');
    expect(homeLink).toHaveClass('min-h-11', 'min-w-11');
    expect(homeLink.querySelector('img')).toHaveClass('size-10');
  });

  it('hides the decorative logo when the image cannot load', () => {
    render(
      <MemoryRouter>
        <SiteHeader currentPage="Overview" />
      </MemoryRouter>
    );

    const logo = screen.getByRole('link', { name: 'Organized Glitter home' }).querySelector('img');

    expect(logo).not.toHaveAttribute('hidden');
    fireEvent.error(logo!);
    expect(logo).toHaveAttribute('hidden');
    expect(screen.getByText('Organized Glitter')).toBeVisible();
  });

  it('reveals the brand name after a guest mobile logo failure', () => {
    authState.user = null;

    render(
      <MemoryRouter>
        <SiteHeader currentPage="Overview" />
      </MemoryRouter>
    );

    const homeLink = screen.getByRole('link', { name: 'Organized Glitter home' });
    const logo = homeLink.querySelector('img');
    const brandName = within(homeLink).getByText('Organized Glitter');

    expect(brandName).toHaveClass('hidden', 'sm:inline');
    fireEvent.error(logo!);
    expect(brandName).toHaveClass('inline');
    expect(brandName).not.toHaveClass('hidden');
  });

  it('updates chrome state from document scrolling instead of the app container', () => {
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0);

    render(
      <MemoryRouter>
        <SiteHeader currentPage="Overview" />
      </MemoryRouter>
    );

    expect(screen.getByRole('banner', { name: 'Site header' })).toHaveClass('sm:bg-transparent');

    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(48);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(screen.getByRole('banner', { name: 'Site header' })).not.toHaveClass(
      'sm:bg-transparent'
    );
  });

  it('renders logged-in desktop nav without search chrome', () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <SiteHeader currentPage="Overview" />
      </MemoryRouter>
    );

    const nav = screen.getByRole('navigation', { name: 'Primary navigation' });
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(nav).getByRole('link', { name: 'Library' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
    expect(within(nav).getByRole('link', { name: 'Randomizer' })).toHaveAttribute(
      'href',
      '/randomizer'
    );
    expect(within(nav).getByRole('link', { name: 'Stats' })).toHaveAttribute('href', '/stats');
    expect(within(nav).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/profile');
    expect(screen.queryByRole('button', { name: /search/i })).not.toBeInTheDocument();
  });

  it('keeps signed-in account controls desktop-only in the header', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/overview']}>
        <SiteHeader currentPage="Overview" />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: 'Account menu' }).parentElement).toHaveClass(
      'hidden',
      'lg:flex'
    );
    expect(screen.queryByRole('button', { name: 'Open account menu' })).not.toBeInTheDocument();
    expect(container.querySelector('.font-handwritten')).toHaveClass('inline');
    expect(container.querySelector('.font-handwritten')).not.toHaveClass('hidden', 'sm:inline');
  });

  it('renders logged-out auth actions as links without nested interactive controls', () => {
    authState.user = null;

    const { container } = render(
      <MemoryRouter>
        <SiteHeader currentPage="Overview" />
      </MemoryRouter>
    );

    const header = screen.getByRole('banner', { name: 'Site header' });
    expect(within(header).getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
    expect(within(header).getByRole('link', { name: 'Get Started' })).toHaveAttribute(
      'href',
      '/register'
    );
    expect(within(header).queryByRole('button', { name: 'Login' })).not.toBeInTheDocument();
    expect(within(header).queryByRole('button', { name: 'Get Started' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('a button, button a')).toHaveLength(0);
  });
});
