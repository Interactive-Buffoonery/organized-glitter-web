# ADR-0003: Build the web app as a client-rendered SPA on Vite

Date: 2026-06-12 (records a decision in place since the project started; written
down during the 2026-06 ADR backfill)

## Status

Accepted

## Context

The web app needs fast iteration for a solo maintainer, a PWA install path, and
direct PocketBase SDK access from the browser. Most of the product sits behind
login, but the public marketing surface (home, `/about`, `/links`, `/privacy`, `/terms`) still needs
to be discoverable, and search visibility matters for growth.

## Decision

The web app is a client-rendered single-page application: React 19 + TypeScript
built with Vite, routed with React Router, and installable as a PWA via
`vite-plugin-pwa` (`autoUpdate` registration). There is no server-side
rendering. SEO for public pages is handled explicitly: static HTML entries for `/`,
`/about`, `/links`, `/privacy`, and `/terms` carry route-specific metadata in
the initial response. Spacefast serves the built public HTML entries and uses
its Function for app deep links. The home page at `/` is
prerendered at build time from the React marketing components, so it loads no
app JavaScript. React updates metadata
during client-side navigation. Sitemap generation and the client-rendered app
shell remain in place without an SSR framework.

## Rejected Alternatives

### Next.js or another SSR/RSC framework

SSR would improve public-page SEO but adds a server rendering layer, framework
lock-in, and operational complexity that the app does not need: almost all
routes are authenticated and personal. The PocketBase SDK and React Query data
model also fit a pure client app naturally.

### Static site generator for marketing plus separate app

Splitting marketing and app into separate builds would duplicate design-system
and deployment work for a very small public surface.

## Consequences

- One build, one deploy target, no hydration or server-render complexity.
- Public-page SEO is a known, watched tradeoff. If discoverability becomes a
  growth constraint, the prerender approach needs to be re-evaluated and that
  revisit deserves a new ADR, not silent drift.
- The host must serve the public HTML entries and return the SPA shell for known
  app deep links. See [`spacefast-routing.md`](../spacefast-routing.md).
- Route-level code splitting and lazy loading stay important because the client
  downloads the app.
