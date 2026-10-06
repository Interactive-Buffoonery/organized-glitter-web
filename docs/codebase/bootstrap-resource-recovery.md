# Initial resource recovery

`public/js/bootstrap-resources.js` is a standalone classic script. It warms
required immutable JavaScript and CSS resources before executing the initial
ESM entry. It waits for DOM parsing, applies the verified stylesheets, and
appends exactly one module entry. It does not import application code.

## Production integration

`scripts/bootstrap-build.mjs` runs as a post `generateBundle` hook after
`scripts/static-landing.mjs`. Landing promotion first copies the original
hashed app stylesheet into the static page and moves the React shell to
`app.html`. Recovery then rewrites every remaining React HTML entry. Static
HTML stays untouched, including its shared stylesheet and page metadata.

The emitted bundle supplies the unique app module, recursive static imports,
and imported CSS. Every JavaScript chunk also gets its recursive static graph
as inert metadata. Missing or unsafe assets and ambiguous app entries fail
the build. No environment values are read by the resource configuration.

React shells inline `loading.css`, `error.css`, `safe-area.css`, theme chrome,
bootstrap analytics, `loading.js`, and the resource loader. Script closures
preserve the original file scope. The body and recovery controls are parsed
before `loading.js` installs listeners, then the loader starts at DOM readiness.
No external deferred shell script can delay that readiness event. Existing
analytics configuration and consent checks remain in place; inlining does not
initialize the React analytics SDK or permit tracking without consent.

The bundle budget reads the inert configuration, cross-checks its complete
static graph against the Vite manifest, and includes `app.html` so inline
shell code, CSS, and graph metadata are counted as document transfer. Dynamic
graph metadata does not turn dynamic resources into eager transfers.

## Build integration contract

For every React HTML entry, the HTML build transform must:

1. Collect the entry module and its complete recursive **static** imports and
   CSS using Vite's output bundle or manifest. Do not include dynamic imports,
   images, fonts, API URLs, or private data.
   Also emit `graphs`, mapping each JavaScript chunk URL to its recursive
   static JS/CSS dependencies. This is metadata only; the loader does not
   fetch dynamic chunks at startup. Chromium can name a healthy dynamic entry
   when a dependency fails, so checking only that entry would miss a 404.
2. Remove every executable app module tag, including the vendor module tags
   Vite emits, and remove their `modulepreload` links. Leaving one behind can
   poison the document's module map before the loader checks the graph.
3. Remove built app stylesheet links and include those URLs in `resources`.
   Keep the static shell styles available independently, ideally inline.
4. Emit the inert JSON configuration below, with build-generated asset URLs.
   Escape `<` in serialized JSON. URLs must be same-origin `/assets/*.js` or
   `/assets/*.css`, without query strings, fragments, or credentials.
5. Inline the contents of `public/js/bootstrap-resources.js` as a classic
   script. This keeps recovery available when external shell JavaScript is
   throttled. The script can live in the head and waits for `DOMContentLoaded`.
   Keep `loading.js` installed before the loader starts the entry; its failure
   event listener and state catch-up also handle earlier exhaustion.

```html
<script type="application/json" id="app-bootstrap-resources">
  {
    "entry": "/assets/main-example.js",
    "resources": ["/assets/vendor-example.js", "/assets/main-example.css"],
    "graphs": {
      "/assets/page-example.js": ["/assets/vendor-example.js", "/assets/page-example.css"]
    }
  }
</script>
```

The loader adds `entry` to the unique resource list automatically. Resources
are fetched serially to avoid another preload burst. The complete static
graph must be covered; retrying a cache-busted entry cannot invalidate a failed
dependency in the browser's ESM module map. No other loader should import or
append the entry. Static public content must not set `data-app-ready`; that
marker belongs to the interactive app.

## Recovery and limits

- Each resource gets at most three requests, with 1s and 2s exponential
  backoff plus up to 249ms of jitter. Only network failures, 408, 429, and 5xx
  are retryable. Other statuses and incorrect MIME types fail immediately.
- Observable `Retry-After` delta seconds and HTTP dates are minimum waits.
  If a wait cannot fit the 25s recovery window, recovery stops instead of
  retrying early. Requests, including their bodies, time out after at most 8s.
- Successful fetches warm the HTTP cache without executing ESM. The browser
  still owns module resolution and stylesheet application. If native graph
  loading fails after warming, the loader rechecks the graph, then uses a
  fresh document. It never reimports a poisoned graph in the same document.
- Automatic document reloads share a tab-local budget of two across initial
  and dynamic failures. Readiness and elapsed time do not reset that budget.
  Unavailable or malformed session storage disables automatic reload.
  Explicit Try again resets this budget and performs the user's reload.
- Reloads preserve the current URL and authentication storage. The loader
  never persists URLs, errors, responses, account data, or tokens and never
  logs resource error payloads. Its only stored field is the attempt count.
  The existing static card receives `og:resource-failure` on
  exhaustion, retains focused Try again and root inertness, and yields to
  late app readiness.

`initializeChunkLoadingRetry` delegates Vite preload errors and unhandled
module rejections to `window.__OG_RESOURCE_RECOVERY__.recoverChunk(error)`.
Only recognized module/CSS load messages with a safe asset URL qualify.
Known JavaScript graphs are checked completely before reload. Without graph
metadata, a healthy JS entry does not trigger reload; an observed transient
status or network failure must recover first. This preserves manual recovery
when the status of an unnamed dependency is unknowable.
Rejections remain intact for route error boundaries and manual recovery.
URL-free browser import errors therefore keep manual recovery. Duplicate
failures share one recovery operation per document. A missing early loader
disables automatic chunk recovery rather than restoring unbounded reloads.

## Validation

`test/bootstrap-resources.test.ts`, `test/loading-script.test.ts`, and
`src/utils/perf/__tests__/chunkLoadingRetry.test.ts` cover the retry policy,
initial entry/dependency/CSS failures, readiness, duplicate initialization,
native graph fallback, cross-document budgets, privacy, and static focus.

The integrated build is also tested in a real browser with initial
entry, dependency, and stylesheet 429/503/network faults, persistent faults,
and permanent 404s. Check that the module graph is requested only after
verification, app initialization occurs once, and the recovery UI remains
usable after exhaustion. HTTP cache warming is an optimization, not proof
that a second native request cannot fail; keep the native fallback covered.

## PWA startup timing

Service worker registration waits for `#root[data-app-ready="true"]`, not
splash dismissal. It then waits one second for the route and splash to settle
and schedules an idle callback with a two-second timeout, falling back to the
one-second timer when idle callbacks are unavailable. Unmount cancels pending
registration. Existing controlling workers continue to serve offline routes
immediately. New installs become offline-ready only after precaching completes.

Vite JavaScript preload hints are suppressed only for the deferred PWA
registration chunk. Native import reuses already evaluated vendor modules.
Normal lazy-route preloads and CSS loading are unchanged.

The complete Workbox precache remains intact. Workbox 7.4.1 installs entries
serially, so adding custom fetch concurrency control would duplicate its
existing policy. More split chunks still mean more background requests and a
longer first-install cache fill. Readiness deferral removes that fill from the
critical startup path; it does not reduce offline coverage or total cache bytes.
The PWA browser suite checks the full emitted JS/CSS graph in CacheStorage,
first-install request concurrency and an offline app reload in Chromium.
Playwright WebKit verifies cache coverage and controlling-worker delivery;
its offline transport rejects navigation before reaching the service worker.
A real offline Safari reload remains a device-level validation gap.

## Static public controls

The static home retains the existing hosting notice using shared notice
markup. Its close button lives in an inert template until an inline classic
script installs the control. Without JavaScript, the notice remains readable
and has no unusable button. With JavaScript, dismissal uses the app's existing
session key and returns focus to the main landmark. This script does not read
authentication, initialize analytics, register a worker, or load React.

Accessibility scan readiness accepts the explicit static landing wrapper and
main landmark when no React root exists. It still waits for full opacity and
settled fonts; static content never receives the app readiness marker. The
smoke inventory includes four new checks for keyboard dismissal followed by
app navigation, bringing smoke coverage to 67 cases and release inventory to
258 cases. Original notice and accessibility assertions remain in place.
