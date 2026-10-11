import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RouteErrorBoundary, {
  shouldFocusRouteErrorHeading,
} from '@/components/error/RouteErrorBoundary';

const mockCaptureException = vi.fn();

vi.mock('posthog-js', () => ({
  default: {
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  },
}));

const ThrowError = ({ message }: { message: string }) => {
  throw new Error(message);
};

describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    document.body.innerHTML = '';
    vi.stubEnv('VITE_CONTACT_EMAIL', 'contact@example.test');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders children when there is no error', () => {
    render(
      <RouteErrorBoundary routeName="dashboard">
        <div data-testid="child">safe child</div>
      </RouteErrorBoundary>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('captures with route and componentStack context when a child throws', () => {
    render(
      <RouteErrorBoundary routeName="dashboard">
        <ThrowError message="private diary private-photo.png https://example.test/?token=synthetic-token" />
      </RouteErrorBoundary>
    );

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [errorArg, propsArg] = mockCaptureException.mock.calls[0];
    expect(errorArg).toBeInstanceOf(Error);
    expect((errorArg as Error).message).toBe('Application error (message redacted)');
    expect((errorArg as Error).stack).not.toMatch(/private diary|private-photo|synthetic-token/);
    expect(propsArg).toEqual(
      expect.objectContaining({
        $exception_source: 'react_error_boundary',
        route: 'dashboard',
        componentStack: expect.any(String),
      })
    );
  });

  it('shows the display name while keeping the route analytics name', () => {
    render(
      <RouteErrorBoundary routeName="Dashboard" displayName="Library">
        <ThrowError message="route blew up" />
      </RouteErrorBoundary>
    );

    expect(screen.getByText('There was an error loading the Library.')).toBeInTheDocument();
    expect(mockCaptureException.mock.calls[0][1]).toEqual(
      expect.objectContaining({ route: 'Dashboard' })
    );
  });

  it('marks the app ready when the route error UI is shown', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const overlay = document.createElement('div');
    overlay.id = 'app-loading';
    document.body.appendChild(overlay);
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <RouteErrorBoundary routeName="dashboard">
        <ThrowError message="Loading chunk dashboard failed" />
      </RouteErrorBoundary>
    );

    expect(screen.getByRole('heading', { name: 'Loading Error' })).toBeInTheDocument();
    expect(root.getAttribute('data-app-ready')).toBe('true');
    expect(root.hasAttribute('inert')).toBe(false);
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app-loaded' }));
  });

  it('focuses the heading and offers email support without role=alert', () => {
    render(
      <RouteErrorBoundary routeName="dashboard">
        <ThrowError message="Loading chunk dashboard failed" />
      </RouteErrorBoundary>
    );

    const heading = screen.getByRole('heading', { name: 'Loading Error' });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(heading).toHaveFocus();
    expect(heading).not.toHaveAttribute('role');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Email support' })).toHaveAttribute(
      'href',
      "mailto:contact@example.test?subject=App%20won't%20load"
    );
  });

  it('marks the app ready before analytics and still shows recovery if captureException throws', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const overlay = document.createElement('div');
    overlay.id = 'app-loading';
    document.body.appendChild(overlay);

    const readyOrder: string[] = [];
    const originalSetAttribute = root.setAttribute.bind(root);
    vi.spyOn(root, 'setAttribute').mockImplementation((name, value) => {
      if (name === 'data-app-ready') {
        readyOrder.push('ready');
      }
      return originalSetAttribute(name, value);
    });
    mockCaptureException.mockImplementation(() => {
      readyOrder.push('analytics');
      throw new Error('analytics down');
    });

    render(
      <RouteErrorBoundary routeName="dashboard">
        <ThrowError message="Loading chunk dashboard failed" />
      </RouteErrorBoundary>
    );

    expect(readyOrder[0]).toBe('ready');
    expect(readyOrder).toContain('analytics');
    expect(root.getAttribute('data-app-ready')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Loading Error' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Loading Error' })).toHaveFocus();
  });

  it('refocuses when hasError becomes true even if retryCount is unchanged', () => {
    // The old componentDidUpdate guard also required retryCount to change.
    // That never happens on the getDerivedStateFromError commit.
    expect(
      shouldFocusRouteErrorHeading(
        { hasError: false, retryCount: 1 },
        { hasError: true, retryCount: 1 }
      )
    ).toBe(true);
    expect(
      shouldFocusRouteErrorHeading(
        { hasError: true, retryCount: 1 },
        { hasError: true, retryCount: 1 }
      )
    ).toBe(false);
    expect(
      shouldFocusRouteErrorHeading(
        { hasError: true, retryCount: 0 },
        { hasError: false, retryCount: 1 }
      )
    ).toBe(false);
  });

  it('refocuses the heading when the error UI recommits after Try Again', async () => {
    const user = userEvent.setup();
    render(
      <RouteErrorBoundary routeName="dashboard">
        <ThrowError message="Loading chunk dashboard failed" />
      </RouteErrorBoundary>
    );

    const firstHeading = screen.getByRole('heading', { name: 'Loading Error' });
    expect(firstHeading).toHaveFocus();
    firstHeading.blur();
    expect(firstHeading).not.toHaveFocus();

    await user.click(screen.getByRole('button', { name: /Try Again/ }));

    expect(screen.getByRole('heading', { name: 'Loading Error' })).toHaveFocus();
  });
});
