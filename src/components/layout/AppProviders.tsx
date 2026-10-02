import React, { createContext, useContext, useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

import { AuthProvider } from '@/contexts/AuthContext';
import { PrivateFileTokenProvider } from '@/contexts/PrivateFileTokenContext';
import { MetadataProvider } from '@/contexts/MetadataContext';
import FeedbackDialogProvider from '@/components/FeedbackDialogProvider';
import { AnalyticsProvider } from '@/components/AnalyticsProvider';
import { AppRouterError } from '@/components/routing/AppRouterError';
import { AccountThemeSync } from '@/components/theme/AccountThemeSync';
import { ThemeClassSync } from '@/components/theme/ThemeClassSync';

import { queryClient } from '@/lib/queryClient';
import { APP_THEMES, DEFAULT_THEME, THEME_STORAGE_KEY } from '@/lib/theme';
import { setupAutomaticCacheCleaning } from '@/utils/query/cacheValidation';
import { UpdateToast } from '@/utils/pwa/UpdateToast';

interface AppProvidersProps {
  children: React.ReactNode;
}

/**
 * Cache cleaning component that sets up automatic cleanup on navigation
 */
const CacheCleanupHandler: React.FC = () => {
  useEffect(() => {
    const cleanup = setupAutomaticCacheCleaning(queryClient);
    return cleanup;
  }, []);

  return null;
};

const AppContentContext = createContext<React.ReactNode>(null);

const AppProviderContents: React.FC = () => {
  const children = useContext(AppContentContext);
  return (
    <>
      <CacheCleanupHandler />
      <AuthProvider>
        <PrivateFileTokenProvider>
          <AccountThemeSync />
          <AnalyticsProvider>
            <MetadataProvider>
              <FeedbackDialogProvider />
              <TooltipProvider>
                {children}
                <Toaster />
                <UpdateToast buildId={__APP_BUILD_ID__} />
              </TooltipProvider>
            </MetadataProvider>
          </AnalyticsProvider>
        </PrivateFileTokenProvider>
      </AuthProvider>
    </>
  );
};

// useBlocker requires a data router. Keep this router stable when outer providers rerender.
const router = createBrowserRouter([
  { path: '*', element: <AppProviderContents />, errorElement: <AppRouterError /> },
]);

/**
 * Centralized provider wrapper for the entire application
 * Router is isolated from provider re-renders to prevent reconciliation interruption
 */
export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme={DEFAULT_THEME}
      enableSystem
      storageKey={THEME_STORAGE_KEY}
      themes={[...APP_THEMES]}
    >
      <ThemeClassSync />
      <AppContentContext.Provider value={children}>
        <RouterProvider router={router} />
      </AppContentContext.Provider>
    </ThemeProvider>
  );
};
