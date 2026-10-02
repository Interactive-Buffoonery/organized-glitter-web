import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useHideSplash } from '@/hooks/useAppReady';
import { useLocationMismatchWarning } from '@/hooks/useLocationMismatchWarning';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { createLogger } from '@/utils/logger';
import { hasPendingSessionRecovery } from '@/services/auth/sessionRecovery';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const protectedRouteLogger = createLogger('ProtectedRoute');

/**
 * Inner component that handles the auth logic after hooks are called
 */
const ProtectedRouteInner: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isLoading, initialCheckComplete } = useAuth();
  const location = useLocation();
  // Hide splash while auth settles, but do not complete the 30s failsafe.
  // Children (the lazy page) have not mounted yet on this spinner branch.
  useHideSplash();

  // Debug logging for route protection decisions (dev only for security)
  protectedRouteLogger.debug('Route protection check:', {
    pathname: location.pathname,
    browserPathname: window.location.pathname,
    isLoading,
    initialCheckComplete,
    hasUser: !!user,
    userId: user?.id,
    timestamp: new Date().toISOString(),
    environment: import.meta.env.MODE,
  });

  // Warn only on persistent router/browser pathname drift; transient
  // mid-navigation mismatches are ignored.
  useLocationMismatchWarning(location.pathname);

  // Wait for auth loading to complete and initial check to finish
  if (isLoading || !initialCheckComplete) {
    protectedRouteLogger.debug('Showing loading state for:', location.pathname, {
      isLoading,
      initialCheckComplete,
      hasUser: !!user,
      timestamp: new Date().toISOString(),
    });
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <div className="flex items-center justify-center gap-2" role="status" aria-live="polite">
          <LoadingSpinner className="size-12" />
          <span className="text-muted-foreground">Loading…</span>
        </div>
        {import.meta.env.DEV && (
          <p className="text-muted-foreground text-xs">
            Route: {location.pathname} | Loading: {isLoading.toString()} | InitialCheck:{' '}
            {initialCheckComplete.toString()} | HasUser: {(!!user).toString()}
          </p>
        )}
      </div>
    );
  }

  if (!user) {
    protectedRouteLogger.debug('Redirecting to login from:', location.pathname, {
      isLoading,
      initialCheckComplete,
      timestamp: new Date().toISOString(),
    });
    return (
      <Navigate
        to="/login"
        state={{ from: location, sessionExpired: hasPendingSessionRecovery() }}
        replace
      />
    );
  }

  protectedRouteLogger.debug('Allowing access to:', location.pathname, 'for user:', user.id, {
    timestamp: new Date().toISOString(),
  });

  return <React.Fragment key={user.id}>{children}</React.Fragment>;
};

/**
 * Protected route wrapper that requires authentication
 * Redirects to login if user is not authenticated
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  try {
    return <ProtectedRouteInner>{children}</ProtectedRouteInner>;
  } catch (error) {
    protectedRouteLogger.error('Failed to render protected route:', error);
    // Fallback to loading state
    return (
      <div
        className="flex min-h-screen items-center justify-center gap-2"
        role="status"
        aria-live="polite"
      >
        <LoadingSpinner className="size-12" />
        <span className="text-muted-foreground">Initializing authentication…</span>
      </div>
    );
  }
};
