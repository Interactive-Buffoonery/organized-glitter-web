import { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '@/utils/logger';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { captureException } from '@/services/analytics-escape-hatch';
import { buildExceptionContext, truncateComponentStack } from '@/utils/error/exceptionContext';
import { sanitizeSensitivePath } from '@/utils/auth/sensitivePath';

/**
 * Data provided to the fallback render function
 */
interface ErrorBoundaryStateData {
  error: Error;
  errorInfo: ErrorInfo | null;
  errorId: string;
  errorTime: string;
  resetErrorBoundary: () => void;
}

type FallbackRender = (props: ErrorBoundaryStateData) => ReactNode;

/**
 * Props for the ErrorBoundary component
 */
interface ErrorBoundaryProps {
  /** The child components to be wrapped by the error boundary */
  children: ReactNode;

  /**
   * A fallback UI to render when an error occurs.
   * Can be a React node or a render function that receives error info.
   * @default A basic error message with a retry button
   */
  fallback?: ReactNode | FallbackRender;

  /**
   * Callback function called when an error is caught
   * @param error - The error that was caught
   * @param errorInfo - Additional error information including component stack
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;

  /**
   * Additional context to include in error logs
   * Useful for debugging and error tracking
   */
  errorContext?: Record<string, unknown>;

  /**
   * Whether to show a reload button in the default fallback UI
   * @default true
   */
  showReloadButton?: boolean;

  /**
   * Callback function called when the error boundary is reset
   */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  errorTime: string | null;
}

function createErrorId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    try {
      return globalThis.crypto.randomUUID().slice(0, 8);
    } catch {
      return createFallbackErrorId();
    }
  }

  return createFallbackErrorId();
}

function createFallbackErrorId() {
  const timePart = Date.now().toString(36).slice(-4).padStart(4, '0');
  const randomPart = Math.random().toString(36).slice(2, 6).padEnd(4, '0');

  return `${timePart}${randomPart}`;
}

/**
 * Default fallback UI component for the error boundary
 */
const DefaultFallback = ({
  error,
  errorInfo,
  onReset,
  showReloadButton = true,
}: {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  onReset: () => void;
  showReloadButton?: boolean;
}) => (
  <Alert variant="destructive">
    <AlertTitle>Something went wrong</AlertTitle>
    <AlertDescription>{error?.message || 'An unexpected error occurred'}</AlertDescription>
    {errorInfo?.componentStack && (
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer">Error details</summary>
        <pre className="bg-card mt-1 max-h-40 overflow-auto rounded p-2">
          {errorInfo.componentStack}
        </pre>
      </details>
    )}
    {showReloadButton && (
      <Button type="button" onClick={onReset} variant="glass" size="sm" className="mt-4">
        Try again
      </Button>
    )}
  </Alert>
);

/**
 * A reusable error boundary component that catches JavaScript errors in its child component tree.
 *
 * @example
 * ```tsx
 * <ErrorBoundary
 *   fallback={({ error, resetErrorBoundary }) => (
 *     <div>
 *       <p>Something went wrong: {error.message}</p>
 *       <button onClick={resetErrorBoundary}>Try again</button>
 *     </div>
 *   )}
 *   onError={(error, errorInfo) => {
 *     logger.error('Error caught by boundary', error, errorInfo);
 *   }}
 *   errorContext={{ component: 'MyComponent' }}
 *   showReloadButton={true}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      errorTime: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    logger.error('ErrorBoundary caught an error', error, {
      componentStack: error.stack,
    });
    return { hasError: true, error, errorId: createErrorId(), errorTime: new Date().toISOString() };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const errorDetails = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      context: this.props.errorContext || {},
      timestamp: new Date().toISOString(),
    };

    logger.error('ErrorBoundary caught an error', error, {
      errorDetails,
      location:
        typeof window !== 'undefined' ? sanitizeSensitivePath(window.location.pathname) : 'server',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      timestamp: errorDetails.timestamp,
    });

    captureException(
      error,
      buildExceptionContext('react_error_boundary', {
        errorContext: this.props.errorContext,
        componentStack: truncateComponentStack(errorInfo.componentStack),
      })
    );

    this.setState({ error, errorInfo });

    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo);
      } catch (e) {
        logger.error('Error in onError callback', e as Error);
      }
    }
  }

  private handleReset = (): void => {
    logger.info('Resetting error boundary');
    const { onReset } = this.props;

    // Call the onReset callback if provided
    if (typeof onReset === 'function') {
      onReset();
    }

    // Reset the error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      errorTime: null,
    });
  };

  /**
   * Renders the fallback UI when an error occurs
   */
  private renderFallback(): ReactNode {
    const { error, errorInfo, errorId, errorTime } = this.state;
    const { fallback, showReloadButton = true } = this.props;

    // Handle render prop fallback
    if (typeof fallback === 'function') {
      return fallback({
        error: error!,
        errorInfo,
        errorId: errorId ?? createErrorId(),
        errorTime: errorTime ?? new Date().toISOString(),
        resetErrorBoundary: this.handleReset,
      });
    }

    // Handle React element fallback
    if (fallback) return fallback;

    // Default fallback UI
    return (
      <DefaultFallback
        error={error}
        errorInfo={errorInfo}
        onReset={this.handleReset}
        showReloadButton={showReloadButton}
      />
    );
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.renderFallback();
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
