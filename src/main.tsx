/**
 * Organized Glitter - Coloring Book and Diamond Art Tracking
 * Copyright (C) 2025 Sarah Wolff
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { createRoot } from 'react-dom/client';
import { StrictMode, lazy, Suspense, type ComponentType } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { initializeUser } from './utils/auth/userInitialization';
import {
  handleFatalError,
  markAppMounted,
  setupGlobalErrorHandlers,
} from './utils/error/fatalErrorHandler';
import { markAppMounted as markExceptionContextMounted } from './utils/error/exceptionContext';
import { logger } from './utils/logger';
import { initializePerformanceMonitoring } from './utils/perf/performanceMonitoring';
import { initializeChunkLoadingRetry } from './utils/perf/chunkLoadingRetry';
import { initializeResourceErrorTracking } from './utils/error/resourceErrorTracking';
import App from './App';
import './index.css';
// Self-hosted fonts to avoid third-party font blockers
import '@fontsource-variable/karla/index.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/600.css';
import '@fontsource/caveat/700.css';

/**
 * Main application bootstrap and initialization
 */

const shouldEnableReactQueryDevtools = import.meta.env.DEV && __APP_TEST_ENV__ !== 'test';

// Flip the mounted flags once the app reports itself live. `app-loaded` can
// also dismiss only the splash, so the root marker is the precise "real
// content is ready" signal. Until then uncaught errors are still treated as
// startup failures and remain fatal-UI-eligible.
const markAppLive = (): void => {
  const root = document.getElementById('root');
  if (root?.getAttribute('data-app-ready') !== 'true') return;

  markAppMounted();
  markExceptionContextMounted();
  window.removeEventListener('app-loaded', markAppLive);
};

// Initialize application services
const initializeApp = (): void => {
  initializeUser();
  setupGlobalErrorHandlers();
  window.addEventListener('app-loaded', markAppLive);
  initializePerformanceMonitoring();
  initializeChunkLoadingRetry();
  initializeResourceErrorTracking();

  // Enable overview performance diagnostics in development
  if (import.meta.env.DEV) {
    import('./utils/overviewDiagnostics').then(m => m.enableDiagnosticConsoleAccess());
  }
};

// Get root element with error handling
const getRootElement = (): HTMLElement => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Failed to find the root element');
  }
  return rootElement;
};

// Render the React application
const renderApp = async (): Promise<void> => {
  try {
    logger.info('🚀 Starting Organized Glitter application...');

    const rootElement = getRootElement();
    const root = createRoot(rootElement);

    // Conditionally define ReactQueryDevtools only in development
    let DevTools: ComponentType<{ initialIsOpen?: boolean }> | null = null;
    if (shouldEnableReactQueryDevtools) {
      const ReactQueryDevtools = lazy(() =>
        import('@tanstack/react-query-devtools').then(module => ({
          default: module.ReactQueryDevtools,
        }))
      );
      DevTools = ReactQueryDevtools;
    }

    // Render React app
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <App />
          {shouldEnableReactQueryDevtools && DevTools && (
            <Suspense fallback={null}>
              <DevTools initialIsOpen={false} />
            </Suspense>
          )}
        </QueryClientProvider>
      </StrictMode>
    );

    logger.info('✅ React app rendered successfully');
    // app-loaded is now dispatched by page components via useAppReady() once
    // real content is ready, keeping the pre-React splash visible until then.
  } catch (error) {
    handleFatalError(error instanceof Error ? error : new Error(String(error)), 'React Render');
  }
};

// Eagerly reload when the service worker controller changes during an update.
// This COMPLEMENTS (does not duplicate) vite-plugin-pwa's own activated-event
// reload: the plugin's listener only attaches after the dynamic registerSW
// import in App.tsx resolves, so this top-level listener covers the narrow race
// where a waiting SW takes control before React/registerSW mounts. The
// hadController guard prevents a reload on first load (no prior controller).
// Do not remove as "redundant" — the two paths cover different timing windows.
if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) {
      window.location.reload();
    }
    hadController = true;
  });
}

// Bootstrap the application
const bootstrap = async (): Promise<void> => {
  initializeApp();
  await renderApp();
};

// Start the application
bootstrap().catch(error => {
  handleFatalError(
    error instanceof Error ? error : new Error(String(error)),
    'Application Bootstrap'
  );
});
