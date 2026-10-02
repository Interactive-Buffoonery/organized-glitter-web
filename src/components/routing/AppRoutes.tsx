import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { ProtectedLazyRoute } from '@/components/routing/ProtectedLazyRoute';
import { useAuth } from '@/hooks/useAuth';
import { useHideSplash } from '@/hooks/useAppReady';
import { useEnabledVerticals } from '@/hooks/useEnabledVerticals';
import { usePageMetadata } from '@/hooks/usePageMetadata';

import { APP_ROUTES, type RouteDef, type RouteMetadata } from './routeDefinitions';

export const VerticalRouteGate: React.FC<{
  children: React.ReactNode;
  requiredVertical: 'diamond_painting' | 'coloring_books';
}> = ({ children, requiredVertical }) => {
  const { user } = useAuth();
  const { diamond_painting, coloring_books, isLoading } = useEnabledVerticals(user?.id);
  // Hide splash while vertical access resolves, but do not complete the 30s
  // failsafe. Children (the lazy page) have not mounted yet on this branch.
  useHideSplash();

  if (isLoading) {
    return (
      <div
        className="flex min-h-[40vh] items-center justify-center gap-2"
        role="status"
        aria-live="polite"
      >
        <Loader2
          className="text-muted-foreground size-8 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        <span className="text-muted-foreground">Loading…</span>
      </div>
    );
  }

  if (requiredVertical === 'diamond_painting' && !diamond_painting) {
    if (coloring_books) {
      return <Navigate to="/dashboard?craft=coloring" replace />;
    }

    return <Navigate to="/dashboard" replace />;
  }

  if (requiredVertical === 'coloring_books' && !coloring_books) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const PageMetadata: React.FC<{ metadata: RouteMetadata }> = ({ metadata }) => {
  usePageMetadata(metadata);

  return null;
};

const AppRouteElement: React.FC<{ route: RouteDef }> = ({ route }) => {
  const Element = route.element;
  const routeErrorBoundary =
    route.errorBoundary ?? (route.suspense && route.suspense !== 'none' ? route.path : undefined);
  const needsWrapper =
    route.protected || routeErrorBoundary || (route.suspense && route.suspense !== 'none');
  const metadata = route.pageOwnsMetadata ? null : <PageMetadata metadata={route.metadata} />;

  if (!needsWrapper) {
    return (
      <>
        {metadata}
        <Element />
      </>
    );
  }

  if (route.verticalAccess === 'diamond_painting') {
    return (
      <>
        {metadata}
        <ProtectedLazyRoute
          protected={route.protected}
          errorBoundary={routeErrorBoundary}
          errorBoundaryLabel={route.errorBoundaryLabel}
          suspense={route.suspense}
        >
          <VerticalRouteGate requiredVertical="diamond_painting">
            <Element />
          </VerticalRouteGate>
        </ProtectedLazyRoute>
      </>
    );
  }

  if (route.verticalAccess === 'coloring_books') {
    return (
      <>
        {metadata}
        <ProtectedLazyRoute
          protected={route.protected}
          errorBoundary={routeErrorBoundary}
          errorBoundaryLabel={route.errorBoundaryLabel}
          suspense={route.suspense}
        >
          <VerticalRouteGate requiredVertical="coloring_books">
            <Element />
          </VerticalRouteGate>
        </ProtectedLazyRoute>
      </>
    );
  }

  return (
    <>
      {metadata}
      <ProtectedLazyRoute
        protected={route.protected}
        errorBoundary={routeErrorBoundary}
        errorBoundaryLabel={route.errorBoundaryLabel}
        suspense={route.suspense}
      >
        <Element />
      </ProtectedLazyRoute>
    </>
  );
};

export const AppRoutes: React.FC = () => (
  <Routes>
    {APP_ROUTES.map(r => (
      <Route key={r.path} path={r.path} element={<AppRouteElement route={r} />} />
    ))}
  </Routes>
);
