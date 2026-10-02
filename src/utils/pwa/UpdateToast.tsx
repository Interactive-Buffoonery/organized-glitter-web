import { useEffect } from 'react';
import { notifySuccess } from '@/lib/notifications/notify';
import { createLogger } from '@/utils/logger';

const BUILD_STORAGE_KEY = 'organized-glitter:build-id';

const syncBuildUpdateToast = (buildId: string): void => {
  if (typeof window === 'undefined' || !buildId) {
    return;
  }

  let previousBuildId: string | null = null;
  try {
    previousBuildId = window.localStorage.getItem(BUILD_STORAGE_KEY);
  } catch (error) {
    // Storage may be unavailable (Safari private mode, quota exceeded, etc.).
    // Without it we cannot tell whether the build changed, so skip the toast.
    createLogger('PWA').debug('Skipping update toast; build-id storage unavailable', { error });
    return;
  }

  // Decide before persisting so StrictMode's double-invoke in development does
  // not poison the comparison on the second run (the first run would otherwise
  // have already written the current id). No prior id means a first visit on
  // this client, which is not an update.
  const isUpdate = previousBuildId !== null && previousBuildId !== buildId;

  try {
    window.localStorage.setItem(BUILD_STORAGE_KEY, buildId);
  } catch {
    // Persisting failed; the toast decision above still holds for this load.
  }

  if (isUpdate) {
    notifySuccess('Your app was updated!');
  }
};

/**
 * Shows a one-shot "Your app was updated!" toast after the PWA auto-reload
 * delivers a new build.
 *
 * autoUpdate reloads the page silently when a new service worker activates, so
 * the refresh is otherwise a mystery to the user. Rather than racing the SW
 * lifecycle to set a flag before that reload (the plugin's own reload and our
 * main.tsx listener compete for it), this compares the last-seen build id in
 * localStorage against the current build on load. Different id => a new build
 * is running => notify and persist. Deterministic, independent of which reload
 * path won. It also fires on a cold start into a newer build (new device/tab
 * since the last visit), where "Your app was updated!" is still accurate.
 *
 * Mounted as a sibling immediately after <Toaster/> so the Toaster subscribes
 * to sonner's store before this effect runs.
 */
export const UpdateToast = ({ buildId }: { buildId: string }): null => {
  useEffect(() => {
    syncBuildUpdateToast(buildId);
  }, [buildId]);

  return null;
};
