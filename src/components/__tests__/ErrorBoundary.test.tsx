import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '@/components/ErrorBoundary';
import {
  ImageErrorBoundary,
  ProjectContentErrorBoundary,
} from '@/components/error/ComponentErrorBoundaries';

const mockCaptureException = vi.fn();

vi.mock('posthog-js', () => ({
  default: {
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  },
}));

const ThrowError = ({ message }: { message: string }) => {
  throw new Error(message);
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    // Suppress console.error from React's error boundary logging during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">safe child</div>
      </ErrorBoundary>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('calls posthog.captureException when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError message="child error" />
      </ErrorBoundary>
    );

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [errorArg, propsArg] = mockCaptureException.mock.calls[0];
    expect(errorArg).toBeInstanceOf(Error);
    expect((errorArg as Error).message).toBe('child error');
    expect(propsArg).toEqual(
      expect.objectContaining({
        $exception_source: 'react_error_boundary',
        componentStack: expect.any(String),
      })
    );
  });

  it('passes errorContext through to posthog.captureException', () => {
    render(
      <ErrorBoundary errorContext={{ component: 'TestWidget', userId: 42 }}>
        <ThrowError message="contextful error" />
      </ErrorBoundary>
    );

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [, propsArg] = mockCaptureException.mock.calls[0];
    expect(propsArg).toMatchObject({
      $exception_source: 'react_error_boundary',
      errorContext: { component: 'TestWidget', userId: 42 },
    });
  });

  it('keeps private image context out of exception properties', () => {
    render(
      <ImageErrorBoundary
        alt="Private project title"
        originalUrl="https://example.test/private.jpg"
      >
        <ThrowError message="image rendering failed" />
      </ImageErrorBoundary>
    );
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const properties = mockCaptureException.mock.calls[0][1];
    expect(properties.errorContext).toEqual({ component: 'Image' });
    expect(JSON.stringify(properties)).not.toMatch(/Private project title|private\.jpg/);
  });

  it('keeps private project IDs out of exception properties', () => {
    render(
      <ProjectContentErrorBoundary projectId="private-project-id">
        <ThrowError message="project rendering failed" />
      </ProjectContentErrorBoundary>
    );
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const properties = mockCaptureException.mock.calls[0][1];
    expect(properties.errorContext).toEqual({ component: 'ProjectContent' });
    expect(JSON.stringify(properties)).not.toContain('private-project-id');
  });

  it('uses a fallback error id when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {});

    render(
      <ErrorBoundary fallback={({ errorId }) => <div>Error id: {errorId}</div>}>
        <ThrowError message="fallback id error" />
      </ErrorBoundary>
    );

    expect(screen.getByText(/^Error id: [a-z0-9]{8}$/)).toBeInTheDocument();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
