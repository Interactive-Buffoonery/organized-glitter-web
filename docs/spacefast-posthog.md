# Optional PostHog proxy on Spacefast

Analytics require both `VITE_PUBLIC_POSTHOG_KEY` and `VITE_PUBLIC_POSTHOG_HOST`.
Set the host to `/glimmer` for the same-origin proxy, or an explicit ingestion
origin for direct use. No key or host means analytics remain disabled.

The runtime proxy requires `POSTHOG_PROXY_HOST`. Static scripts can use a separate
`POSTHOG_PROXY_ASSET_HOST`. Without a configured upstream it returns 404 without
an outbound request. Build and runtime settings must agree.

Upstream requests preserve query strings and bodies while allowing only `Accept`
and `Content-Type` headers. Cookies, authorization, forwarding headers, and
referrers are stripped. Bodies are limited to 1 MiB with a 10 second timeout.
Protocol-relative paths are rejected. Redirects and upstream failures are best
effort empty responses. Tests verify these behaviors with synthetic requests.

See [official deployment configuration](official-deployment.md). Production
analytics validation remains a separate ops gate.
