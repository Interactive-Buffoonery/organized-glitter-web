import { useEffect } from 'react';

/**
 * Signals the pre-React loading splash that the app is ready to be shown by
 * dispatching the global `app-loaded` event, which causes `loading.js` to fade
 * out the `#app-loading` overlay and reveal `#root`.
 *
 * When ready, the hook also sets `data-app-ready="true"` on `#root`. That
 * marker is the startup failsafe-complete signal: loading.js may dismiss the
 * splash on `app-loaded` without it, but the 30s timeout still shows Retry
 * unless this hook (or `markAppReady` / `handleFatalError`) has marked the
 * tree ready. A later `markAppReady` / `useAppReady(true)` also dismisses an
 * already-shown `#app-error`. Suspense fallbacks (`PageLoading`) never call
 * this hook. Other parts of the app may also dispatch `app-loaded`
 * independently (see `fatalErrorHandler` and `useHideSplash`); the receiver
 * in `loading.js` is idempotent so duplicate dispatches are harmless.
 *
 * This hook skips the splash dispatch when both startup shells are already
 * gone, so re-mounts after the splash has faded stay quiet, and a re-shown
 * splash after a retry can be dismissed again. If `#app-error` is still in the
 * document after a splash-only dismiss, or is the visible recovery, a ready
 * call still dispatches so loading.js can retire or hide that node. The ready
 * marker is always set so a late failsafe can no-op instead of showing
 * `#app-error`.
 *
 * @param ready - When false, this call is a no-op. Prefer bare
 *                `useAppReady()` on mount for interactive routes so slow
 *                in-app data loading cannot keep the splash up until the 30s
 *                `#app-error` path. Auth/root/login pending spinners should
 *                call `useHideSplash` instead of this hook so a later hung
 *                lazy chunk can still time out. Defaults to true so bare
 *                `useAppReady()` fires on mount.
 */
export function useAppReady(ready: boolean = true) {
  useEffect(() => {
    if (!ready) return;
    markAppReady();
  }, [ready]);
}

/**
 * Hide the pre-React splash without completing the 30s failsafe.
 *
 * Auth and root pending spinners use this so users see in-app loading UI
 * while `#root` stays unmarked. A hung lazy chunk or hung auth check can
 * still reach `startup_timeout`. Do not call this from `PageLoading`.
 */
export function useHideSplash(hide: boolean = true) {
  useEffect(() => {
    if (!hide) return;
    hideSplash();
  }, [hide]);
}

/**
 * Mark startup failsafe-complete and hide the splash if it is still visible.
 * Call from a real page mount, a login/register form, the route error
 * boundary, or tests. Sets `data-app-ready` before `app-loaded` so loading.js
 * can no-op the 30s timer at fire time, retire a leftover `#app-error` node,
 * and dismiss an already-shown recovery card.
 */
export function markAppReady() {
  document.getElementById('root')?.setAttribute('data-app-ready', 'true');
  dispatchAppLoadedIfStartupShellPresent();
}

/**
 * Hide the splash without setting `data-app-ready`. The 30s failsafe stays armed.
 */
export function hideSplash() {
  dispatchAppLoadedIfSplashVisible();
}

function isSplashOverlayVisible(overlay: HTMLElement | null) {
  return Boolean(overlay && overlay.style.display !== 'none');
}

function dispatchAppLoadedIfSplashVisible() {
  const overlay = document.getElementById('app-loading');
  if (!isSplashOverlayVisible(overlay)) return;

  window.dispatchEvent(new CustomEvent('app-loaded'));
}

function dispatchAppLoadedIfStartupShellPresent() {
  const overlay = document.getElementById('app-loading');
  const errorEl = document.getElementById('app-error');
  if (!isSplashOverlayVisible(overlay) && !errorEl) return;

  window.dispatchEvent(new CustomEvent('app-loaded'));
}
