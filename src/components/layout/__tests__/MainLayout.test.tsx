import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AuthContextType } from '@/contexts/AuthContext/types';
import { useAuth } from '@/hooks/useAuth';

const { mobileState } = vi.hoisted(() => ({
  mobileState: {
    isMobile: false,
    isTablet: false,
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useMobileDevice: () => mobileState,
}));

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => <button type="button">Toggle theme</button>,
}));

vi.mock('../BottomNavigation', () => ({
  default: () => <nav aria-label="Bottom navigation" />,
}));

import MainLayout from '../MainLayout';

const baseUser = { id: 'u1', email: 'test@example.com', created: '', updated: '' };

const loggedInReady: AuthContextType = {
  user: baseUser,
  isAuthenticated: true,
  isLoading: false,
  initialCheckComplete: true,
  signOut: vi.fn(),
};

describe('MainLayout', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue(loggedInReady);
    mobileState.isMobile = false;
    mobileState.isTablet = false;
  });

  it('applies top safe area on the root when the header is hidden', () => {
    const { container } = render(
      <MemoryRouter>
        <MainLayout hideNav hideFooter currentPage="Links">
          <p>Body</p>
        </MainLayout>
      </MemoryRouter>
    );

    expect(container.firstElementChild).toHaveClass('site-header-safe-area');
    expect(screen.queryByRole('banner', { name: 'Site header' })).not.toBeInTheDocument();
  });

  it('does not apply top safe area on the root when SiteHeader is shown', () => {
    const { container } = render(
      <MemoryRouter>
        <MainLayout hideFooter currentPage="Overview">
          <p>Body</p>
        </MainLayout>
      </MemoryRouter>
    );

    expect(container.firstElementChild).not.toHaveClass('site-header-safe-area');
    expect(screen.getByRole('banner', { name: 'Site header' })).toHaveClass(
      'site-header-safe-area'
    );
  });

  it('renders a skip link before the header and targets the main landmark', () => {
    const { container } = render(
      <MemoryRouter>
        <MainLayout hideFooter currentPage="Overview">
          <p>Body</p>
        </MainLayout>
      </MemoryRouter>
    );

    const skipLink = screen.getByRole('link', { name: 'Skip to content' });
    const header = screen.getByRole('banner', { name: 'Site header' });
    const rootChildren = Array.from(container.firstElementChild?.children ?? []);

    expect(rootChildren.indexOf(skipLink)).toBeLessThan(rootChildren.indexOf(header));
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
  });

  it('applies top safe area on the root when loading with hideNav', () => {
    vi.mocked(useAuth).mockReturnValue({
      ...loggedInReady,
      user: null,
      isAuthenticated: false,
      isLoading: true,
    });

    const { container } = render(
      <MemoryRouter>
        <MainLayout hideNav showLoader currentPage="Links">
          <p>Body</p>
        </MainLayout>
      </MemoryRouter>
    );

    expect(container.firstElementChild).toHaveClass('site-header-safe-area');
    expect(screen.queryByRole('banner', { name: 'Site header' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#main-content'
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
  });

  it('reserves the shared bottom-nav height when mobile chrome is visible', () => {
    mobileState.isMobile = true;

    render(
      <MemoryRouter>
        <MainLayout hideFooter currentPage="Overview">
          <p>Body</p>
        </MainLayout>
      </MemoryRouter>
    );

    expect(screen.getByRole('main')).toHaveStyle({
      paddingBottom: 'var(--bottom-nav-total-height)',
    });
    expect(screen.getByRole('navigation', { name: 'Bottom navigation' })).toBeInTheDocument();
  });
});
