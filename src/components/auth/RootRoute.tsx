import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useHideSplash } from '@/hooks/useAppReady';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { createLogger } from '@/utils/logger';
import Home from '@/pages/Home';

const logger = createLogger('RootRoute');

export const RootRoute: React.FC = () => {
  const { isLoading, initialCheckComplete } = useAuth();
  // Hide splash while auth settles, but do not complete the 30s failsafe.
  // Home calls useAppReady once it actually mounts.
  useHideSplash();

  if (isLoading || !initialCheckComplete) {
    logger.debug('Still loading or initial check not complete, showing loading...', {
      isLoading,
      initialCheckComplete,
    });

    return (
      <div
        className="flex min-h-screen items-center justify-center gap-2"
        role="status"
        aria-live="polite"
      >
        <LoadingSpinner className="size-12" />
        <span className="text-muted-foreground">Loading…</span>
      </div>
    );
  }

  logger.debug('Showing Home page...');

  return <Home />;
};
