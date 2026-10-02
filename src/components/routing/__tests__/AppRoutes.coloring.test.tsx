import '@testing-library/jest-dom/vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { authState, enabledVerticalsState } = vi.hoisted(() => ({
  authState: {
    user: { id: 'user-123' },
    isLoading: false,
    initialCheckComplete: true,
  },
  enabledVerticalsState: {
    diamond_painting: true,
    coloring_books: true,
    isLoading: false,
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/useEnabledVerticals', () => ({
  useEnabledVerticals: () => enabledVerticalsState,
}));

vi.mock('@/components/auth/RootRoute', () => ({
  RootRoute: () => <div>Root route</div>,
}));

vi.mock('@/pages/Login', () => ({ default: () => <div>Login</div> }));
vi.mock('@/pages/Register', () => ({ default: () => <div>Register</div> }));
vi.mock('@/pages/NotFound', () => ({ default: () => <div>Not found</div> }));
vi.mock('@/pages/ForgotPassword.tsx', () => ({ default: () => <div>Forgot password</div> }));
vi.mock('@/pages/ResetPassword.tsx', () => ({ default: () => <div>Reset password</div> }));
vi.mock('@/pages/ConfirmPasswordReset.tsx', () => ({
  default: () => <div>Confirm password reset</div>,
}));
vi.mock('@/pages/VerifyEmail', () => ({ default: () => <div>Verify email</div> }));
vi.mock('@/pages/EmailConfirmation', () => ({ default: () => <div>Email confirmation</div> }));
vi.mock('@/pages/About', () => ({ default: () => <div>About</div> }));
vi.mock('@/pages/Privacy', () => ({ default: () => <div>Privacy</div> }));
vi.mock('@/pages/Terms', () => ({ default: () => <div>Terms</div> }));
vi.mock('@/pages/LinksPage', () => ({ default: () => <div>Links</div> }));
vi.mock('@/pages/Overview', () => ({ default: () => <div>Overview</div> }));
vi.mock('@/pages/Dashboard', () => ({ default: () => <div>Dashboard page</div> }));
vi.mock('@/pages/Profile', () => ({ default: () => <div>Profile</div> }));
vi.mock('@/pages/Options', () => ({ default: () => <div>Options hub</div> }));
vi.mock('@/pages/NewProject', () => ({ default: () => <div>New project</div> }));
vi.mock('@/pages/ProjectDetail', () => ({ default: () => <div>Project detail</div> }));
vi.mock('@/pages/EditProject', () => ({ default: () => <div>Edit project</div> }));
vi.mock('@/pages/ChangePassword.tsx', () => ({ default: () => <div>Change password</div> }));
vi.mock('@/pages/ChangeEmail', () => ({ default: () => <div>Change email</div> }));
vi.mock('@/pages/ConfirmEmailChange', () => ({ default: () => <div>Confirm email change</div> }));
vi.mock('@/pages/DeleteAccount', () => ({ default: () => <div>Delete account</div> }));
vi.mock('@/pages/CompanyList', () => ({ default: () => <div>Companies</div> }));
vi.mock('@/pages/ArtistList', () => ({ default: () => <div>Artists</div> }));
vi.mock('@/pages/TagList', () => ({ default: () => <div>Tags</div> }));
vi.mock('@/pages/BookPublisherList', () => ({ default: () => <div>Publishers</div> }));
vi.mock('@/pages/BookIllustratorList', () => ({ default: () => <div>Illustrators</div> }));
vi.mock('@/pages/ColoringMediumList', () => ({ default: () => <div>Coloring mediums</div> }));
vi.mock('@/pages/SupportSuccess', () => ({ default: () => <div>Support success</div> }));
vi.mock('@/pages/ProjectRandomizer', () => ({ default: () => <div>Randomizer</div> }));
vi.mock('@/pages/NewColoringBook', () => ({ default: () => <div>New coloring book</div> }));
vi.mock('@/pages/EditColoringBook', () => ({ default: () => <div>Edit coloring book</div> }));
vi.mock('@/pages/ColoringBookDetail', () => ({ default: () => <div>Coloring book detail</div> }));
vi.mock('@/pages/ColoringPageDetail', () => ({ default: () => <div>Coloring page detail</div> }));

import { AppRoutes } from '../AppRoutes';

const CurrentLocation = () => {
  const location = useLocation();
  return <div data-testid="current-location">{`${location.pathname}${location.search}`}</div>;
};

const renderRoutes = (initialRoute: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <QueryClientProvider client={queryClient}>
        <AppRoutes />
        <CurrentLocation />
      </QueryClientProvider>
    </MemoryRouter>
  );
};

describe('AppRoutes coloring guards', () => {
  beforeEach(() => {
    authState.user = { id: 'user-123' };
    authState.isLoading = false;
    authState.initialCheckComplete = true;
    enabledVerticalsState.diamond_painting = true;
    enabledVerticalsState.coloring_books = true;
    enabledVerticalsState.isLoading = false;
  });

  it('redirects the legacy coloring dashboard route to the unified coloring dashboard', async () => {
    renderRoutes('/coloring?status=active');

    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/dashboard?status=active&craft=coloring'
    );
  });

  it('redirects the legacy new coloring route to unified coloring creation', async () => {
    renderRoutes('/coloring/new');

    expect(await screen.findByText('New coloring book')).toBeInTheDocument();
    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/projects/new?craft=coloring'
    );
  });

  it('routes the unified new-project path to coloring when requested', async () => {
    renderRoutes('/projects/new?craft=coloring');

    expect(await screen.findByText('New coloring book')).toBeInTheDocument();
    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/projects/new?craft=coloring'
    );
  });

  it('renders the coloring book edit route when coloring is enabled', async () => {
    renderRoutes('/coloring/book-123/edit');

    expect(await screen.findByText('Edit coloring book')).toBeInTheDocument();
  });

  it('falls back to diamond project creation when coloring creation is disabled', async () => {
    enabledVerticalsState.coloring_books = false;

    renderRoutes('/projects/new?craft=coloring');

    await waitFor(() => {
      expect(screen.getByText('New project')).toBeInTheDocument();
    });
    expect(screen.queryByText('New coloring book')).not.toBeInTheDocument();
  });

  it('routes diamond project creation to coloring when diamond painting is disabled', async () => {
    enabledVerticalsState.diamond_painting = false;
    enabledVerticalsState.coloring_books = true;

    renderRoutes('/projects/new');

    await waitFor(() => {
      expect(screen.getByText('New coloring book')).toBeInTheDocument();
    });
    expect(screen.queryByText('New project')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-location')).toHaveTextContent(
      '/projects/new?craft=coloring'
    );
  });

  it('redirects legacy coloring creation to diamond creation when coloring is disabled', async () => {
    enabledVerticalsState.coloring_books = false;

    renderRoutes('/coloring/new');

    await waitFor(() => {
      expect(screen.getByText('New project')).toBeInTheDocument();
    });
    expect(screen.queryByText('New coloring book')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-location')).toHaveTextContent('/projects/new');
  });

  it('redirects legacy coloring dashboard to dashboard when coloring is disabled', async () => {
    enabledVerticalsState.coloring_books = false;

    renderRoutes('/coloring');

    await waitFor(() => {
      expect(screen.getByText('Dashboard page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('current-location')).toHaveTextContent('/dashboard');
  });

  it.each([
    ['/options', 'Options hub'],
    ['/options/companies', 'Companies'],
    ['/options/artists', 'Artists'],
    ['/options/tags', 'Tags'],
    ['/options/publishers', 'Publishers'],
    ['/options/illustrators', 'Illustrators'],
    ['/options/coloring-mediums', 'Coloring mediums'],
  ])('renders %s', async (route, text) => {
    renderRoutes(route);

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it.each([
    ['/options/publishers', 'Publishers'],
    ['/options/illustrators', 'Illustrators'],
    ['/options/coloring-mediums', 'Coloring mediums'],
  ])('redirects %s when coloring options are disabled', async (route, text) => {
    enabledVerticalsState.coloring_books = false;

    renderRoutes(route);

    await waitFor(() => {
      expect(screen.getByText('Dashboard page')).toBeInTheDocument();
    });
    expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(screen.getByTestId('current-location')).toHaveTextContent('/dashboard');
  });

  it.each([
    ['/options/companies', 'Companies'],
    ['/options/artists', 'Artists'],
    ['/options/tags', 'Tags'],
    ['/projects/project-123', 'Project detail'],
    ['/projects/project-123/edit', 'Edit project'],
  ])('redirects %s when diamond painting options are disabled', async (route, text) => {
    enabledVerticalsState.diamond_painting = false;
    enabledVerticalsState.coloring_books = true;

    renderRoutes(route);

    await waitFor(() => {
      expect(screen.getByText('Dashboard page')).toBeInTheDocument();
    });
    expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(screen.getByTestId('current-location')).toHaveTextContent('/dashboard?craft=coloring');
  });

  it('redirects the legacy import route to Data settings when only coloring is enabled', async () => {
    enabledVerticalsState.diamond_painting = false;
    enabledVerticalsState.coloring_books = true;

    renderRoutes('/import');

    await waitFor(() => {
      expect(screen.getByText('Profile')).toBeInTheDocument();
    });
    expect(screen.getByTestId('current-location')).toHaveTextContent('/profile?tab=data');
  });

  it.each([
    ['/companies', 'Companies'],
    ['/artists', 'Artists'],
    ['/tags', 'Tags'],
  ])('redirects %s to its options route', async (route, text) => {
    renderRoutes(route);

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('redirects the coloring edit route when coloring is disabled', async () => {
    enabledVerticalsState.coloring_books = false;

    renderRoutes('/coloring/book-123/edit');

    await waitFor(() => {
      expect(screen.getByText('Dashboard page')).toBeInTheDocument();
    });
    expect(screen.queryByText('Edit coloring book')).not.toBeInTheDocument();
  });
});
