import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { imported, registerModule } = vi.hoisted(() => ({
  imported: vi.fn(),
  registerModule: Promise.withResolvers<void>(),
}));

vi.mock('@/components/auth/RootRoute', () => {
  imported('root');
  return { RootRoute: () => <div>Home route</div> };
});
vi.mock('@/pages/Register', async () => {
  imported('register');
  await registerModule.promise;
  return { default: () => <div>Create account form</div> };
});
vi.mock('@/pages/ForgotPassword', () => {
  imported('forgot-password');
  throw new Error('Failed to fetch dynamically imported module');
});
vi.mock('@/pages/Login', () => ({ default: () => <div>Log in form</div> }));
vi.mock('@/pages/Terms', () => {
  imported('terms');
  return { default: () => <div>Terms</div> };
});
vi.mock('@/services/analytics-escape-hatch', () => ({ captureException: vi.fn() }));

import { APP_ROUTES } from '../routeDefinitions';
import { ProtectedLazyRoute } from '../ProtectedLazyRoute';

const renderRoute = (path: string) => {
  const route = APP_ROUTES.find(route => route.path === path)!;
  const Page = route.element;
  return render(
    <div id="root">
      <MemoryRouter initialEntries={[path]}>
        <ProtectedLazyRoute suspense={route.suspense} errorBoundary={route.path}>
          <Page />
        </ProtectedLazyRoute>
      </MemoryRouter>
    </div>
  );
};

describe('public route loading boundaries', () => {
  it('shows login without importing unrelated public pages or the root auth gate', () => {
    renderRoute('/login');
    expect(screen.getByText('Log in form')).toBeInTheDocument();
    expect(imported).not.toHaveBeenCalled();
  });

  it('keeps pending registration in the loading boundary until its form is available', async () => {
    renderRoute('/register');
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByText('Create account form')).not.toBeInTheDocument();
    await act(async () => registerModule.resolve());
    expect(await screen.findByText('Create account form')).toBeInTheDocument();
    expect(imported).toHaveBeenCalledWith('register');
    expect(imported).not.toHaveBeenCalledWith('root');
    expect(imported).not.toHaveBeenCalledWith('terms');
  });

  it('surfaces rejected public route modules through the existing recovery UI', async () => {
    renderRoute('/forgot-password');
    expect(
      await screen.findByRole('heading', { name: /Loading Error|Something went wrong/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload Page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go Back' })).toBeInTheDocument();
    expect(document.getElementById('root')).toHaveAttribute('data-app-ready', 'true');
  });
});
