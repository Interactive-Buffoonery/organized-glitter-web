import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
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
});
