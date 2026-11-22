/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute, setCatchHandler } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope;

// A failed precache must not keep an older, possibly broken worker in control. Workbox's install
// passes its own promise to waitUntil, so the guard wraps waitUntil before that listener runs.
// Entries that did not cache load from the network until the next deploy precaches them.
self.addEventListener('install', event => {
  const waitUntil = event.waitUntil.bind(event);
  event.waitUntil = promise =>
    waitUntil(
      Promise.resolve(promise).catch((error: unknown) => console.warn('Precache incomplete', error))
    );
});

// Activate on update so a fresh load gets new responses, including headers like CSP.
self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// App routes use the precached shell. Without it, request the route itself: a refetch of
// app.html can be redirected by the host, and browsers reject redirected navigations.
// The dev server does not apply build defines to the worker, so dev navigations use the network.
if (typeof __SW_NAVIGATION_ALLOWLIST__ !== 'undefined') {
  registerRoute(
    new NavigationRoute(
      async ({ request }) => (await matchPrecache('app.html')) ?? fetch(request),
      {
        allowlist: __SW_NAVIGATION_ALLOWLIST__.map(source => new RegExp(source, 'i')),
        denylist: __SW_NAVIGATION_DENYLIST__.map(source => new RegExp(source, 'i')),
      }
    )
  );
}

// Unreadable or evicted cache storage must never block the page.
setCatchHandler(({ request }) => fetch(request));
