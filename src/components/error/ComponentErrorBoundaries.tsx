import React, { ErrorInfo } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { logger } from '@/utils/logger';
import { Button } from '@/components/ui/button';
import FallbackImage from '@/components/projects/FallbackImage';
import { getContactEmail } from '@/lib/contactConfig';

// ── Shared Helpers ──────────────────────────────────────────────────────────────

/**
 * Logs an error caught by a component error boundary with standardized context,
 * and safely invokes an optional onError callback.
 */
function logBoundaryError(
  message: string,
  context: Record<string, unknown>,
  error: Error,
  errorInfo: ErrorInfo,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) {
  logger.error(message, {
    ...context,
    timestamp: new Date().toISOString(),
    path: window.location.pathname,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    componentStack: errorInfo?.componentStack,
  });

  if (onError) {
    try {
      onError(error, errorInfo);
    } catch (e) {
      logger.error('Error in error boundary callback', e as Error);
    }
  }
}

/**
 * Opens a pre-filled mailto link for reporting an error, including diagnostic
 * fields and the current URL.
 */
function openReportIssueEmail(
  subject: string,
  fields: Record<string, string | undefined>,
  email = getContactEmail()
) {
  if (!email) return;
  const body =
    Object.entries(fields)
      .reduce<string[]>((lines, [k, v]) => {
        if (v !== undefined) {
          lines.push(`${k}: ${v}`);
        }
        return lines;
      }, [])
      .join('\n') +
    `\nURL: ${window.location.href}\n` +
    `Error: Please describe what you were doing when the error occurred.`;
  window.open(
    `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  );
}

function withCacheBust(url: string) {
  return url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
}

function getCurrentIsoTimestamp() {
  return new Date().toISOString();
}

function formatErrorTime(errorTime: string | number | Date) {
  return new Date(errorTime).toLocaleTimeString();
}

function replaceImageSrc(children: React.ReactNode, src: string): React.ReactNode {
  return React.Children.map(children, child => {
    if (!React.isValidElement(child)) return child;

    if (child.type === 'img') {
      return React.cloneElement(child as React.ReactElement<{ src?: string }>, { src });
    }

    const props = child.props as { children?: React.ReactNode };
    if (!props.children) return child;

    return React.cloneElement(child as React.ReactElement<{ children?: React.ReactNode }>, {
      children: replaceImageSrc(props.children, src),
    });
  });
}

// ── ProjectContentErrorBoundary ─────────────────────────────────────────────────

/**
 * Error boundary specifically for project content sections.
 * Isolates errors in project displays from affecting the rest of the UI.
 */
interface ProjectContentErrorBoundaryProps {
  children: React.ReactNode;
  projectId?: string;
}

export const ProjectContentErrorBoundary: React.FC<ProjectContentErrorBoundaryProps> = ({
  children,
  projectId,
}) => {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) =>
        logBoundaryError('Error in project content component', { projectId }, error, errorInfo)
      }
      errorContext={{
        component: 'ProjectContent',
        projectId,
        location: window.location.pathname,
      }}
      fallback={({ resetErrorBoundary, errorId }) => (
        <div className="border-border bg-muted/50 mx-auto max-w-2xl rounded-lg border p-6 shadow-sm">
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-foreground text-xl font-semibold">
                Unable to display project content
              </h3>
              <p className="text-muted-foreground">
                We encountered an issue while trying to display this project's content. Our team has
                been notified.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => resetErrorBoundary()}
                className="flex-1 sm:flex-none"
              >
                Try again
              </Button>
              <Button
                variant="outline"
                onClick={() => window.history.back()}
                className="flex-1 sm:flex-none"
              >
                Go back
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  openReportIssueEmail('Error in Project Content', {
                    'Project ID': projectId || 'N/A',
                  })
                }
                className="flex-1 sm:flex-none"
              >
                Report issue
              </Button>
            </div>

            <details className="border-border border-t pt-2">
              <summary className="text-muted-foreground cursor-pointer text-sm font-medium">
                Technical details
              </summary>
              <div className="bg-background mt-2 overflow-auto rounded-md p-3 font-mono text-xs">
                <div>Project ID: {projectId || 'Not available'}</div>
                <div className="mt-1">Path: {window.location.pathname}</div>
                <div className="mt-1 text-xs opacity-70">Error ID: {errorId}</div>
              </div>
            </details>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
};

// ── ImageErrorBoundary ──────────────────────────────────────────────────────────

/**
 * Error boundary for image components.
 * Handles image loading failures gracefully with a fallback placeholder.
 */
interface ImageErrorBoundaryProps {
  children: React.ReactNode;
  alt?: string;
  originalUrl?: string;
  className?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

export const ImageErrorBoundary: React.FC<ImageErrorBoundaryProps> = ({
  children,
  alt = 'Image',
  originalUrl,
  className = '',
  onError,
}) => {
  const [cacheBustedUrl, setCacheBustedUrl] = React.useState<string | null>(null);
  const activeUrl = cacheBustedUrl ?? originalUrl;

  return (
    <ErrorBoundary
      onError={(error, errorInfo) =>
        logBoundaryError(
          'Error loading image',
          { component: 'Image', alt, originalUrl: activeUrl },
          error,
          errorInfo,
          onError
        )
      }
      errorContext={{
        component: 'Image',
        alt,
        originalUrl: activeUrl,
        location: window.location.pathname,
      }}
      fallback={({ resetErrorBoundary }) => (
        <div className={`group relative ${className}`}>
          <div className="bg-muted/50 absolute inset-0 flex items-center justify-center p-4 text-center">
            <div className="space-y-2">
              <div className="text-muted-foreground text-sm font-medium">Couldn't load image</div>
              {activeUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setCacheBustedUrl(withCacheBust(activeUrl));
                    resetErrorBoundary();
                  }}
                >
                  Retry
                </Button>
              )}
            </div>
          </div>
          <FallbackImage alt={alt} originalUrl={activeUrl} className={className} />
        </div>
      )}
    >
      {activeUrl ? replaceImageSrc(children, activeUrl) : children}
    </ErrorBoundary>
  );
};

// ── OverviewErrorBoundary ───────────────────────────────────────────────────────

/**
 * Overview-specific error boundary with cache refresh capability.
 * Provides graceful degradation for overview page component errors.
 */
interface OverviewErrorBoundaryProps {
  children: React.ReactNode;
  onCacheRefresh?: () => void;
  hasInfrastructureError?: boolean;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

export const OverviewErrorBoundary: React.FC<OverviewErrorBoundaryProps> = ({
  children,
  onCacheRefresh,
  hasInfrastructureError = false,
  onError,
}) => {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) =>
        logBoundaryError(
          'Error in overview component',
          { component: 'Overview', hasInfrastructureError },
          error,
          errorInfo,
          onError
        )
      }
      errorContext={{
        component: 'Overview',
        hasInfrastructureError,
        location: window.location.pathname,
      }}
      fallback={({ resetErrorBoundary, errorId, errorTime }) => (
        <div className="container mx-auto px-4 py-8">
          <div className="space-y-6 py-12 text-center">
            <div className="bg-destructive/10 mx-auto flex size-16 items-center justify-center rounded-full">
              <svg
                className="text-destructive-text size-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-foreground text-2xl font-semibold">Something went wrong</h2>
              <p className="text-muted-foreground mx-auto max-w-md">
                {hasInfrastructureError
                  ? "We're experiencing server issues. Your data is safe and we're working to restore normal service."
                  : 'There was an unexpected error loading your overview. Please try again.'}
              </p>
            </div>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                type="button"
                onClick={() => resetErrorBoundary()}
                variant="glass"
                className="px-6 py-2"
              >
                Try Again
              </Button>
              {onCacheRefresh && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onCacheRefresh();
                    resetErrorBoundary();
                  }}
                  className="px-6 py-2"
                >
                  Clear Cache & Retry
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => (window.location.href = '/dashboard')}
                className="px-6 py-2"
              >
                Go to Library
              </Button>
            </div>
            <div className="flex flex-col justify-center gap-3 text-sm sm:flex-row">
              <button
                type="button"
                onClick={() =>
                  openReportIssueEmail('Overview Page Error', {
                    'Infrastructure Error': hasInfrastructureError ? 'Yes' : 'No',
                    Timestamp: getCurrentIsoTimestamp(),
                  })
                }
                className="text-muted-foreground hover:text-foreground underline"
              >
                Report this issue
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-muted-foreground hover:text-foreground underline"
              >
                Refresh page
              </button>
            </div>
            {hasInfrastructureError && (
              <div className="mx-auto max-w-md rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Server Status:</strong> We're aware of the issue and working to resolve
                  it. You can check status updates at our support channels.
                </p>
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  Error ID: {errorId} • Time: {formatErrorTime(errorTime)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
};
