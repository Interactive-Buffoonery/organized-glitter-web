import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import TestWrapper from '@/test-utils/TestWrapper';

const { mockNavigate, authState, mobileState, enabledVerticalsState, logger } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  authState: {
    user: { id: 'user-123' },
  },
  mobileState: {
    isMobile: true,
    isTablet: false,
  },
  enabledVerticalsState: {
    diamond_painting: true,
    coloring_books: false,
    isLoading: false,
  },
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/use-mobile', () => ({
  useMobileDevice: () => mobileState,
}));

vi.mock('@/hooks/useEnabledVerticals', () => ({
  useEnabledVerticals: () => enabledVerticalsState,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => logger,
}));

vi.mock('@/components/notes-feed/NoteTargetPicker', () => ({
  NoteTargetPicker: ({ open }: { open: boolean }) =>
    open ? <dialog open>Progress note target picker</dialog> : null,
}));

vi.mock('../MobileAccountMenu', () => ({
  MobileAccountMenu: ({ triggerVariant }: { triggerVariant?: string }) => (
    <button type="button" data-trigger-variant={triggerVariant}>
      Open account menu
    </button>
  ),
}));

import BottomNavigation from '../BottomNavigation';

const renderWithProviders = (ui: ReactElement, { initialRoute = '/' } = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return render(
    <TestWrapper queryClient={queryClient} initialRoute={initialRoute}>
      {ui}
    </TestWrapper>
  );
};

describe('BottomNavigation add action', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    logger.info.mockReset();
    document.body.classList.remove('has-bottom-nav');
    authState.user = { id: 'user-123' };
    mobileState.isMobile = true;
    mobileState.isTablet = false;
    enabledVerticalsState.diamond_painting = true;
    enabledVerticalsState.coloring_books = false;
    enabledVerticalsState.isLoading = false;
  });

  it('labels the collection tab Library and keeps its existing route', () => {
    renderWithProviders(<BottomNavigation />, { initialRoute: '/dashboard' });

    expect(screen.getByRole('link', { name: 'Navigate to Library' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });

  it('opens the add menu when only diamond painting is enabled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BottomNavigation />, { initialRoute: '/dashboard' });

    const addButton = screen.getByRole('button', { name: 'Add new item' });

    expect(addButton).toHaveAttribute('type', 'button');
    expect(addButton).toHaveClass('min-h-[44px]');

    await user.click(addButton);

    expect(
      await screen.findByRole('menuitem', { name: 'New diamond painting' })
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add a progress note' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'New coloring book' })).not.toBeInTheDocument();
  });

  it('opens the add menu when only coloring is enabled', async () => {
    const user = userEvent.setup();
    enabledVerticalsState.diamond_painting = false;
    enabledVerticalsState.coloring_books = true;

    renderWithProviders(<BottomNavigation />, { initialRoute: '/dashboard' });

    await user.click(screen.getByRole('button', { name: 'Add new item' }));

    expect(await screen.findByRole('menuitem', { name: 'New coloring book' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add a progress note' })).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'New diamond painting' })
    ).not.toBeInTheDocument();
  });

  it('shows all add actions when both verticals are enabled and navigates after choosing an option', async () => {
    const user = userEvent.setup();
    enabledVerticalsState.diamond_painting = true;
    enabledVerticalsState.coloring_books = true;

    renderWithProviders(<BottomNavigation />, { initialRoute: '/dashboard' });

    await user.click(screen.getByRole('button', { name: 'Add new item' }));

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('menuitem', { name: 'New diamond painting' })
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'New coloring book' })).toHaveClass('min-h-12');
    expect(screen.getByRole('menuitem', { name: 'Add a progress note' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'New coloring book' }));

    expect(mockNavigate).toHaveBeenCalledWith('/projects/new?craft=coloring');
  });

  it('opens the progress-note target picker from the add menu', async () => {
    const user = userEvent.setup();

    renderWithProviders(<BottomNavigation />, { initialRoute: '/dashboard' });

    await user.click(screen.getByRole('button', { name: 'Add new item' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Add a progress note' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Progress note target picker');
  });

  it('hides the add action when both verticals are disabled', () => {
    enabledVerticalsState.diamond_painting = false;
    enabledVerticalsState.coloring_books = false;

    renderWithProviders(<BottomNavigation />, { initialRoute: '/dashboard' });

    expect(screen.queryByRole('button', { name: /add new/i })).not.toBeInTheDocument();
  });

  it('replaces the Profile footer slot with the account menu trigger', () => {
    renderWithProviders(<BottomNavigation />, { initialRoute: '/overview' });

    expect(screen.queryByRole('link', { name: 'Navigate to Profile' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open account menu' })).toHaveAttribute(
      'data-trigger-variant',
      'bottom-nav'
    );
  });

  it('keeps the body bottom-nav marker scoped to the mounted mobile nav', () => {
    const { unmount } = renderWithProviders(<BottomNavigation />, { initialRoute: '/overview' });

    expect(document.body).toHaveClass('has-bottom-nav');

    unmount();

    expect(document.body).not.toHaveClass('has-bottom-nav');
  });

  it('does not add the bottom-nav marker when the nav is hidden on desktop', () => {
    mobileState.isMobile = false;
    mobileState.isTablet = false;

    renderWithProviders(<BottomNavigation />, { initialRoute: '/overview' });

    expect(screen.queryByRole('navigation', { name: 'Bottom navigation' })).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass('has-bottom-nav');
  });
});
