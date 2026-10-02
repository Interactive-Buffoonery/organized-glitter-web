# Organized Glitter Web

Organized Glitter is a coloring book and diamond art tracker. This repository
contains the complete website, including the tracker, Astro updates blog,
newsletter templates, and PocketBase backend for self-hosting or local development.

One public deployment example: [organizedglitter.app](https://organizedglitter.app).
That hosted service is operated separately from this source tree.

## What it does

- Tracks diamond art projects from wishlist through completed and archived states.
- Tracks coloring books, pages, mediums, publishers, illustrators, and progress notes.
- Stores progress notes with dates and photos.
- Organizes tags, companies, artists, and related metadata.
- Provides filtering, sorting, search, import/export, and a project randomizer.
- Keeps user data private by default through PocketBase collection rules.

## Tech stack

- React 19, TypeScript, Vite, React Router
- PocketBase for auth, collections, file storage, and hook endpoints
- TanStack Query, React Hook Form, Zod
- Tailwind CSS 4 and local design-system components
- Vitest, Testing Library, and Playwright

See [`PRODUCT.md`](PRODUCT.md), [`DESIGN.md`](DESIGN.md), and [`docs/README.md`](docs/README.md).

## Prerequisites

- Node.js 24.x
- pnpm 11.1.2 or newer
- PocketBase 0.40.4 for local database work

The repo includes an `.nvmrc` set to Node 24.

## Quick start

Install dependencies:

```bash
pnpm install
```

Bootstrap a local PocketBase instance with the committed schema and seed data:

```bash
VITE_POCKETBASE_URL=http://localhost:8090 pnpm pb:bootstrap:local -- --seed
```

Start PocketBase:

```bash
pnpm pb:local
```

In a second terminal, start the app against local PocketBase:

```bash
pnpm dev:local
```

Seeded local login:

```txt
Email: local-user@example.test
Password: local-test-password-123
```

Copy [`.env.example`](.env.example) to `.env` when you need tooling credentials
or custom contact settings.

Full setup details: [`docs/pocketbase/local-development.md`](docs/pocketbase/local-development.md).

## Self-hosting

You need:

1. A built static frontend (`pnpm build` with `VITE_POCKETBASE_URL` and
   `VITE_APP_URL` set to your deployment origins)
2. A PocketBase instance with the committed hooks and migrations applied
3. Optional mail configuration for feedback (`FEEDBACK_TO_EMAIL`)

The included Node server in `server/local-build-server.js` can serve the built
app locally or behind your reverse proxy. See [`docs/README.md`](docs/README.md)
for architecture and contracts.

Optional Spacefast adapter code lives in `spacefast/` for teams that use that
hosting platform. It is not required for self-hosting.

## Common commands

```bash
pnpm dev:local
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm pb:validate:schema
pnpm pb:validate:migrations
```

## Repository layout

```txt
src/              React web app
pb_hooks/         PocketBase hook endpoints
pb_migrations/    PocketBase migrations
server/           Static app server and route policy
docs/             Architecture, schema, and contributor docs
e2e/              Playwright specs
scripts/          Bootstrap, validation, and test helpers
```

## Related projects

- Native iOS app (Apache-2.0):
  [organized-glitter-app](https://github.com/Interactive-Buffoonery/organized-glitter-app)

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

Licensed under the GNU Affero General Public License v3.0 or later. See
[`LICENSE`](LICENSE), [`NOTICE`](NOTICE), and [`BRAND.md`](BRAND.md).

## Complete website and official services

See [the official deployment boundary](docs/official-deployment.md) and
[public configuration example](config/official-site.env.example). Ops builds a
pinned public revision and supplies official services and credentials. The public
source preserves the entire website. Optional integrations are disabled when
configuration is absent.
