# PostHog proxy on Spacefast

The production web build sends PostHog SDK and bootstrap events to the
same-origin `/glimmer` path. A Spacefast Function forwards that path to the
two existing US PostHog hosts. Capture and config requests go to
`us.i.posthog.com`; static and array requests go to
`us-assets.i.posthog.com`. Query strings and request bodies are preserved.
The target host is fixed before the request path is assigned, so a path that
starts with two slashes cannot redirect the proxy to another host.

The Function constructs upstream requests from a small header allowlist:
`Accept` and `Content-Type`. Browser cookies, authorization, forwarded IPs,
and page referrers do not travel to PostHog. POST bodies are limited to 1 MiB
and upstream requests have a 10 second timeout. A failed upstream request or
redirect returns 204, preserving the existing best-effort behavior. Static
responses keep selected content and cache headers.

The local tests cover route mapping, query strings, POST bodies, stripped
private headers, oversized requests, and upstream failure. The guarded preview
publish checks the activated Function version and requests a live PostHog decide
response through that same version. It no longer requires feedback environment
bindings. The runtime status may report `fetch=false` even while the proxy
returns live upstream data; record that mismatch, but use the live response as
the functional gate.

On preview version `ver_ac9bd0076b504604999a670dcc2c8954`, the guarded
decide probe passed. A labeled capture POST returned 200, and the connected
Organized Glitter PostHog project recorded one matching event. Short headless
browser sessions did not show an SDK capture request. Sarah then signed in and
navigated the preview in her regular browser. PostHog recorded five preview-host
`$pageview` events between 14:56 and 14:57 Eastern on September 25, including
Login and Overview, with the `web` library. The app SDK capture path passed for
that session.

A combined build with the Railway preview public PostHog key was published to
the private probe space. Authenticated GET requests to `/glimmer/decide/?v=2` and
`/glimmer/static/array.js` returned JSON and JavaScript from PostHog. A
Chromium browser pass observed `/glimmer/e/` responses with status 200. Rapid
page navigation also triggered Spacefast's private-space 429 limit and app
module load failures, so a slower browser pass is needed before acceptance.

References:

https://linear.app/interactive-buffoonery/issue/INT-1137/preserve-the-posthog-proxy-on-spacefast

https://spacefast.com/docs/runtimes/functions
