# Dependency provenance overrides

`pnpm-workspace.yaml` retains `trustPolicy: no-downgrade` and the three-day
minimum release age. The following version-scoped overrides replace locked
releases that lack provenance despite earlier releases having provenance:

| Requested dependency                                      | Replacement | Consumer                         |
| --------------------------------------------------------- | ----------- | -------------------------------- |
| `semver@^6`                                               | `7.8.5`     | Babel and its helper packages    |
| `undici-types@~6.21.0`                                    | `6.23.0`    | Node 22 type declarations        |
| `@trickfilm400/rollup-plugin-off-main-thread@^3.0.0-pre1` | `4.0.0`     | Workbox's service-worker bundler |

Semver 7 preserves Babel's public API calls and supports the repository's Node
24 runtime. The worker plugin keeps its CommonJS export and loader template;
its runtime change replaces the `matchAll` polyfill with native `String.matchAll`.
It also updates EJS from `3.1.10` to `7.0.1`. Validate Babel transformations,
typechecking, production service-worker generation, and PWA navigation when
changing these overrides.

The repository currently pins pnpm `11.1.2`. Frozen-lockfile policy
revalidation was introduced in [pnpm 11.1.3](https://github.com/pnpm/pnpm/releases/tag/v11.1.3).
Validate provenance fixes with pnpm `11.1.3` or newer, retaining the policy and
release-age settings. A passing install with the older pin alone does not
establish that every locked package meets the trust policy.

Remove an override only after its parent package requests a policy-compliant
replacement and the frozen lockfile passes revalidation. Do not replace these
overrides with trust exemptions.
