# Spacefast routing during the web-host move

The Spacefast build publishes Vite's `dist` directory. Vite copies
`public/_redirects` and `public/_headers` into that directory. Static files,
including the four dedicated public HTML pages, answer before the Function.
The Function handles known app deep links, unknown paths, and `/glimmer/*`.
Feedback goes directly to PocketBase. Hashed Vite assets retain their long-lived
browser cache rule.

With `BLOG_ENABLED=true`, the combined build also includes Astro's static
`/updates/` pages, RSS, and sitemap. The blog owns that path, including missing
post 404s; it must not fall through to the React app shell or the service
worker's navigation fallback. See the [website configuration](./official-deployment.md) for
build commands, MailPoet checks, and the separate production cutover.

## Static landing and app shell

The build writes two HTML documents for the root app:

- `dist/index.html` is the static landing for `/`. `landing.html` supplies
  its head, and `scripts/static-pages.mjs` renders
  `src/components/marketing/StaticPages.tsx` into it. It loads the app
  stylesheet but no app JavaScript, so it stays usable when bundles fail.
- `dist/privacy.html` and `dist/terms.html` render the shared policy
  components from `src/components/legal` the same way. The in-app Privacy
  and Terms routes use those components too, so the copy lives in one place.
  Each static page inlines `src/styles/static-critical.css` ahead of the app
  stylesheet so it stays readable if that stylesheet fails.
- `dist/app.html` is the SPA shell built from `index.html`. Known app routes
  such as `/login`, `/register`, `/overview`, and deep links receive it.

Every host must follow that split. The local build server serves `app.html`
for app routes. The Spacefast Function embeds both documents and answers `/`
with the landing. The service worker falls back to `app.html` and leaves `/`
to the precached landing. Returning members use Login, which forwards an
existing session to `/overview`. `pnpm dev` still serves the SPA at `/`,
`/privacy`, and `/terms`.

Run `pnpm spacefast:stage` after building. It copies the Function and shared
route policy into `dist` and embeds the built app shell, landing, 404 page, and HTML
security headers in the Function bundle. `server/app-route-policy.test.js`
checks that the server policy stays aligned with the React route definitions.
The app's HTML responses declare `frame-ancestors 'none'` and
`X-Frame-Options: DENY` to prevent other sites from embedding the app.
Unknown public paths receive the dedicated HTML 404 page. Missing static
files and unknown API paths keep HTTP 404 responses.

The existing `organized-glitter-preview` space has an older SPA fallback to
`/index.html`, which now serves the static landing. Verify on a staged, unpromoted version that this space setting
does not intercept unknown routes before the Function. Remove the fallback on
the production space before cutover if it would turn unknown paths into 200s.

Check the rules locally after building:

```bash
sf routing inspect --routing ./dist \
  --url /about --url /about/ --url /links \
  --url /privacy --url /terms
```

CLI 0.4.1 currently reports `config_invalid` and `config_unknown_key` for the
flat `sf.jsonc` Function runtime declaration, although the published config
format documents it. Use the deployed preview for the final route check.

The `Cache-Control` header rule affects browser responses. The CLI warns that
Spacefast manages its own edge cache. Private Spacefast preview access also
returns `Cache-Control: private, no-store`, so public cache behavior still
needs validation before the web domain moves.

An earlier authenticated probe of unpromoted v10 confirmed the four public
routes, trailing-slash forms, and the old app fallback. The `_headers` rules
appeared on successful file responses. A generated 404 for a missing asset did
not include `Permissions-Policy` or `X-Content-Type-Options`; validate error
responses on the public host before cutover. The private preview cannot
establish public asset cache behavior.

The association file initially served as `application/octet-stream` on the
combined preview. A path-specific `_headers` rule changed it to
`application/json; charset=utf-8`; private preview v19 returned that content
type and `X-Content-Type-Options: nosniff`.

Related work:

- SpaceFast domain cutover runbook (historical reference outside this extraction) (INT-1139)

https://linear.app/interactive-buffoonery/issue/INT-1135/match-frontend-routing-and-headers-on-spacefast

https://linear.app/interactive-buffoonery/issue/INT-1136/keep-feedback-working-without-railway

https://linear.app/interactive-buffoonery/issue/INT-1137/preserve-the-posthog-proxy-on-spacefast

## Automatic dev preview

A successful CI run for a push to `dev` requests a build in the private ops
repository. Ops builds the checked commit and publishes it to
`https://organized-glitter-dev.view.fast`. It checks the current `dev` SHA again
before publishing. If a newer merge arrives, the older build cannot publish.
The publish queue shares the existing release-preview lock.

The `spacefast-dev-preview.yml` workflow must merge into ops `main` before the
web relay merges. The relay uses the existing `OPS_PREVIEW_DISPATCH_TOKEN`.
Spacefast credentials stay in ops. Feature PRs do not publish this preview.
