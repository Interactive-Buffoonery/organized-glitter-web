# Official website and ops boundary

Decision: 2026-10-02. Preserve the entire Organized Glitter website in the public
repository, including the React tracker, marketing pages, Astro updates blog,
contact page, newsletter signup, and newsletter page templates.

The public repository is the canonical application source. The official
`organizedglitter.app` deployment builds an immutable revision of this source.
The ops repository contains deployment orchestration, service settings, backups,
monitoring, and operator runbooks. It does not contain a second copy of the app.
No ops repository or production cutover has been created by this change.

## Configuration

[`config/official-site.env.example`](../config/official-site.env.example) records
public service settings for the official deployment. Review the backend and
contact values against the current deployment before cutover. Supply the same
service settings to the build and Node runtime so the generated metadata, sitemap,
CSP, and server CSP agree. Spacefast runtime variables configure its optional
analytics proxy separately.

Set `VITE_APP_VERSION` to the deployed public commit and `VITE_SOURCE_URL` to its
immutable GitHub tree URL. The tracker and Astro footer expose the source link.
Public Vite values are shipped to browsers; never put credentials in them.

`BLOG_ENABLED=true` builds and assembles Astro into the same website. An explicit
`WORDPRESS_API_URL` fetches published posts and selected newsletter support pages.
Missing WordPress configuration produces an empty updates page without outbound
fetches. Missing newsletter/contact configuration shows a clear unavailable
message. Configured WordPress failures stop the build rather than publishing a
partial snapshot. MailPoet frames must belong to that WordPress source origin.

The MailPoet templates are in [`snippets/`](./snippets/). WordPress and MailPoet
remain external services. Subscriber data, delivery credentials, and WordPress
administration belong to ops. Public source preserves their website integration.

Optional services are disabled by default: analytics needs both a project key and
host, donations need a PayPal button ID, and feedback needs operator mail settings.
The Apple association endpoint defaults to an empty app list. Configure
`APPLE_APP_IDS` on PocketBase and `nativeClientId` in the existing private Apple
configuration alongside its signing and grant encryption keys. The official
native client ID is `com.interactivebuffoonery.organizedglitter`.

The authenticated PocketBase feedback route is preferred. The legacy Node mail
route uses the TCP peer for rate limiting by default. Set
`FEEDBACK_TRUSTED_PROXY_HOPS` only behind a trusted proxy that overwrites
`X-Real-IP` and `X-Forwarded-For` and prevents direct access to the Node server.

Analytics sanitizes URL and path properties at the SDK emission boundary,
including session-entry and initial person properties. Authentication tokens,
query strings, and fragments must not be sent to analytics.

## Cutover gates

A passing source PR does not prove a deployed site. Before switching the official
build source, ops must record the pinned revision, backup and restore evidence,
PocketBase schema/migration checks, authenticated browser checks, provider settings,
mail delivery, newsletter confirmation/manage/unsubscribe behavior, and rollback.
Keep the existing domain and data. Production changes require a separate explicit
instruction. This PR performs no deployment or production migration.

A first public bootstrap has an empty root commit and no earlier deployed schema.
The upgrade validator recognizes only that empty root as a bootstrap baseline;
normal public commits retain the prior-schema and immutable migration checks.
Fresh-install and protected-file upgrade checks remain separate required gates.
The protected-file test carries a reviewed schema-only baseline fixture rather
than depending on a private Git commit. It contains no user records or provider
credentials.

## Request a release preview

After a same-repository, non-draft `dev` to `main` PR passes CI, add the
`spacefast-preview` label. This requests one preview build in the private ops
repository for that exact head commit. It does not publish the official site.
New pushes do not automatically request another preview. Remove and re-add the
label after the new CI passes to rebuild.

The relay workflow checks event metadata and dispatches ops `main` without
checking out or running application code. Ops rechecks the PR, label, commit,
release CI, and publication checks before building and publishing. Synchronize
new `main` commits into `dev` first so the preview includes the release baseline.

Provision `OPS_PREVIEW_DISPATCH_TOKEN` as a web repository secret. Use a
fine-grained token restricted to `organized-glitter-ops`, with Actions read/write
permission. Spacefast and source-map credentials remain in ops. The relay cannot
use the web repository's default GitHub token to dispatch a private ops workflow.

Follow `Build labeled release preview` in ops Actions for build results and the
immutable preview URL. The existing preview Space serves the accepted build at
`https://organized-glitter-preview.view.fast`. Production promotion is separate.
