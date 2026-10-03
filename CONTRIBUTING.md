# Contributing to Organized Glitter Web

Thank you for your interest in contributing. This repository is the public web
app and PocketBase backend for Organized Glitter.

## Before you start

1. Read [`README.md`](README.md) for local setup.
2. Read [`AGENTS.md`](AGENTS.md) for repo layout and required checks.
3. Read [`docs/agents/code-conventions.md`](docs/agents/code-conventions.md) for
   coding style.

## Development setup

```bash
pnpm install
pnpm pb:install:test -- --destination=local-pb-db/pocketbase
LOCAL_POCKETBASE_TEST_USER_EMAIL=local-user@example.test VITE_POCKETBASE_URL=http://localhost:8090 pnpm pb:bootstrap:local -- --seed --no-keepalive
pnpm pb:local
```

In a second terminal:

```bash
pnpm dev:local
```

Copy [`.env.example`](.env.example) to `.env` and adjust values for your
environment. Do not commit secrets.

## Pull requests

- Branch from `dev`. Release work merges `dev` into `main`.
- Keep each pull request focused on one concern.
- Include tests when behavior changes.
- Update docs when workflows, schema, or setup steps change.
- Run the checks below before opening a PR.

## Required checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm pb:validate:schema
pnpm pb:validate:migrations
```

For larger changes, also run `pnpm test:pr` locally if you have PocketBase and
Playwright available.

## PocketBase changes

Schema changes must stay aligned across:

- `pb_migrations/`
- `docs/pocketbase/collections.schema.json`
- generated types in `src/types/`
- hook behavior in `pb_hooks/`

See [`docs/pocketbase/local-development.md`](docs/pocketbase/local-development.md).

## Security

Report vulnerabilities privately. See [`SECURITY.md`](SECURITY.md).

## Code of conduct

Be respectful and constructive. Focus on the work, not the person.

## License

By contributing, you agree that your contributions are licensed under the same
terms as this project: GNU Affero General Public License v3.0 or later.
