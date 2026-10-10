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

import React, { useEffect } from 'react';
import { createLogger } from '@/utils/logger';
import { AppProviders } from '@/components/layout/AppProviders.tsx';
import { AppRoutes } from '@/components/routing/AppRoutes.tsx';
import { ColoringWalkthroughGate } from '@/components/onboarding';
import { useAppInitialization } from '@/hooks/useAppInitialization.ts';
import { useConnectionRecovery } from '@/hooks/useConnectionRecovery.ts';
import { OfflinePage } from '@/components/OfflinePage.tsx';
import { getLegacyResetHashPath } from '@/utils/auth/resetLink';
import { scheduleAfterAppReady } from '@/utils/pwa/scheduleAfterAppReady';

/**
 * Main App component
 * Handles application layout, initialization, and routing
 */
const App: React.FC = () => {
  // Initialize global services and error handlers
  useAppInitialization();

  const { state: connectionState, checkConnection } = useConnectionRecovery();

  // Register after the ready route settles. autoUpdate handles activation
  // (see main.tsx for the lifecycle listener that complements it).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const pwaLogger = createLogger('PWA');

    let disposed = false;
    const cancel = scheduleAfterAppReady(() => {
      void import('virtual:pwa-register')
        .then(({ registerSW }) => {
          if (disposed) return;
          registerSW({
            // Register immediately so existing clients check for a newer SW/build on first load.
            immediate: true,
            onRegisteredSW(_swUrl, registration) {
              registration?.update()?.catch(error => {
                pwaLogger.debug(
                  'Automatic PWA update check failed (non-critical; initial registration can still succeed and the current build will keep running)',
                  { error }
                );
              });
            },
          });
        })
        .catch(error => {
          pwaLogger.debug('PWA registration not available', { error });
        });
    });
    return () => {
      disposed = true;
      cancel();
    };
  }, []);

  useEffect(() => {
    const resetPath = getLegacyResetHashPath(window.location.hash);
    if (resetPath) {
      window.location.replace(resetPath);
    }
  }, []);

  return (
    <div className="mobile-app-container text-foreground">
      <AppProviders>
        <AppRoutes />
        <ColoringWalkthroughGate />
      </AppProviders>

      {connectionState.status !== 'online' && (
        <OfflinePage
          onCheckConnection={checkConnection}
          isChecking={connectionState.status === 'checking'}
          error={connectionState.status === 'failed' ? connectionState.message : null}
        />
      )}
    </div>
  );
};

export default App;
