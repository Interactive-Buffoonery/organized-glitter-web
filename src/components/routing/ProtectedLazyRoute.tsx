import React, { Suspense } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PageLoading } from '@/components/ui/page-loading';
import RouteErrorBoundary from '@/components/error/RouteErrorBoundary';

export type SuspenseKind = 'layout' | 'bare' | 'none';

interface ProtectedLazyRouteProps {
  children: React.ReactNode;
  protected?: boolean;
  errorBoundary?: string;
  errorBoundaryLabel?: string;
  suspense?: SuspenseKind;
}

export const ProtectedLazyRoute: React.FC<ProtectedLazyRouteProps> = ({
  children,
  protected: isProtected = false,
  errorBoundary,
  errorBoundaryLabel,
  suspense = 'none',
}) => {
  let node: React.ReactNode = children;

  // Innermost first. ProtectedRoute stays inside Suspense so a pending
  // chunk never mounts it and never hides the splash. Auth-spinner commits
  // may call useHideSplash but must not call useAppReady. Suspense wraps
  // that next. RouteErrorBoundary is outermost so a rejected lazy chunk
  // reaches the chunk-load UI and can mark the app ready.
  if (isProtected) {
    node = <ProtectedRoute>{node}</ProtectedRoute>;
  }

  if (suspense !== 'none') {
    const fallback = suspense === 'layout' ? <PageLoading withLayout /> : <PageLoading />;
    node = <Suspense fallback={fallback}>{node}</Suspense>;
  }

  if (errorBoundary) {
    node = (
      <RouteErrorBoundary routeName={errorBoundary} displayName={errorBoundaryLabel}>
        {node}
      </RouteErrorBoundary>
    );
  }

  return <>{node}</>;
};
