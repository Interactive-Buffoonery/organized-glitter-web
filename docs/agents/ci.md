# Continuous integration

Feature branches target `dev`. Releases target `main` from `dev`.

## Default PR checks

The `CI` workflow runs on every pull request and push to `dev` or `main`:

| Job                   | What it verifies                                            |
| --------------------- | ----------------------------------------------------------- |
| Static checks         | Typecheck, format, lint, PocketBase boundary, workflow lint |
| Unit and server tests | Vitest suite                                                |
| PocketBase schema     | Committed schema export and migration files                 |
| Production build      | `pnpm build` and bundle budget                              |
| CI result             | Aggregate gate; all jobs above must pass                    |

There are no path filters. Documentation-only changes receive the same checks.

## Optional local gates

The private app used a heavier gate with browser smoke, React Doctor, PocketBase
hook integration tests, and scheduled Playwright runs. Those are not part of the
default public CI yet. Before release work, run locally:

```bash
pnpm test:pr
```

## Scheduled maintenance

`dependency-security.yml` runs weekly and on demand. It uploads `pnpm audit`
reports as artifacts. It does not block merges.

## Credentials

Default CI jobs use read-only repository permissions and no production secrets.
