import { Component, createRef, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { markAppReady } from '@/hooks/useAppReady';
import { logger } from '@/utils/logger';
import { captureException } from '@/services/analytics-escape-hatch';
import { buildExceptionContext, truncateComponentStack } from '@/utils/error/exceptionContext';
import { focusWhenRootInteractive } from '@/utils/focusWhenRootInteractive';
import { getSupportMailto } from '@/lib/contactConfig';

interface RouteErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  retryCount: number;
}

interface RouteErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  routeName?: string;
  displayName?: string;
}

type RouteErrorFocusGuardState = Pick<RouteErrorBoundaryState, 'hasError' | 'retryCount'>;

/**
 * Focus when recovery UI appears. `retryCount` is part of the state shape but
 * must not gate focus: getDerivedStateFromError only flips `hasError`, and
 * handleRetry changes `retryCount` together with `hasError = false`.
 */
export function shouldFocusRouteErrorHeading(
  prevState: RouteErrorFocusGuardState,
  nextState: RouteErrorFocusGuardState
): boolean {
  return nextState.hasError && !prevState.hasError;
}

class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  private maxRetries = 3;
  private headingRef = createRef<HTMLHeadingElement>();
  private stopWaitingForRoot: (() => void) | null = null;

  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<RouteErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    try {
      // Reveal #root and retire the 30s #app-error card before analytics so a
      // throw from logger/captureException cannot skip the error UI.
      markAppReady();

      logger.error(`[RouteErrorBoundary] Error in ${this.props.routeName || 'route'}:`, {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
      });

      captureException(
        error,
        buildExceptionContext('react_error_boundary', {
          route: this.props.routeName,
          componentStack: truncateComponentStack(errorInfo.componentStack),
        })
      );
    } catch {
      // Analytics or logging must not hide recovery.
    } finally {
      this.setState(
        {
          error,
          errorInfo,
        },
        this.focusHeading
      );
    }
  }

  componentDidUpdate(_prevProps: RouteErrorBoundaryProps, prevState: RouteErrorBoundaryState) {
    if (shouldFocusRouteErrorHeading(prevState, this.state)) {
      this.focusHeading();
    }
  }

  componentWillUnmount() {
    this.stopWaitingForRoot?.();
    this.stopWaitingForRoot = null;
  }

  focusHeading = () => {
    this.stopWaitingForRoot?.();
    this.stopWaitingForRoot = focusWhenRootInteractive(this.headingRef.current);
  };

  handleRetry = () => {
    const newRetryCount = this.state.retryCount + 1;

    if (newRetryCount <= this.maxRetries) {
      logger.log(
        `[RouteErrorBoundary] Retrying ${this.props.routeName || 'route'} (attempt ${newRetryCount}/${this.maxRetries})`
      );
      this.setState({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
        retryCount: newRetryCount,
      });
    }
  };

  handleReload = () => {
    logger.log(`[RouteErrorBoundary] Reloading page for ${this.props.routeName || 'route'}`);
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const canRetry = this.state.retryCount < this.maxRetries;
      const isChunkError =
        this.state.error?.message?.includes('Loading chunk') ||
        this.state.error?.message?.includes('Failed to fetch');
      const supportMailto = getSupportMailto("App won't load");

      return (
        <div className="container mx-auto px-4 py-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 ref={this.headingRef} tabIndex={-1} className="mb-4 text-2xl font-semibold">
              {isChunkError ? 'Loading Error' : 'Something went wrong'}
            </h1>

            <div className="bg-muted mb-6 rounded-lg p-4">
              <p className="text-muted-foreground mb-2">
                {isChunkError
                  ? 'Failed to load the page resources. This may be due to a network issue or recent deployment.'
                  : `There was an error loading the ${this.props.displayName || this.props.routeName || 'page'}.`}
              </p>

              {import.meta.env.DEV && this.state.error && (
                <details className="mt-4 text-left">
                  <summary className="cursor-pointer text-sm font-medium">
                    Error Details (Dev Mode)
                  </summary>
                  <pre className="bg-background mt-2 overflow-auto rounded p-2 text-xs">
                    {this.state.error.message}
                    {this.state.error.stack && `\n\n${this.state.error.stack}`}
                  </pre>
                </details>
              )}
            </div>

            <div className="gap-x-4">
              {canRetry && (
                <Button type="button" onClick={this.handleRetry} variant="glass">
                  Try Again{' '}
                  {this.state.retryCount > 0 &&
                    `(${this.maxRetries - this.state.retryCount} attempts left)`}
                </Button>
              )}

              <Button type="button" onClick={this.handleReload} variant="outline">
                Reload Page
              </Button>

              <Button type="button" onClick={() => window.history.back()} variant="ghost">
                Go Back
              </Button>
            </div>

            {supportMailto ? (
              <p className="text-muted-foreground mt-4 text-sm">
                Still stuck?{' '}
                <a href={supportMailto} className="text-link underline underline-offset-4">
                  Email support
                </a>
              </p>
            ) : (
              <p className="text-muted-foreground mt-4 text-sm">
                Still stuck? Contact your administrator for help.
              </p>
            )}

            {this.state.retryCount >= this.maxRetries && (
              <p className="text-muted-foreground mt-4 text-sm">
                Maximum retry attempts reached. Please try reloading the page or contact support if
                the issue persists.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default RouteErrorBoundary;
