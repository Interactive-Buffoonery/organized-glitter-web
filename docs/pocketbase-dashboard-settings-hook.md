# PocketBase dashboard settings hook

`pb_hooks/dashboard_settings.pb.js` owns the server-side contract for `user_dashboard_settings.vertical_enabled`.

## Contract

- Missing, empty, null, or unparseable `vertical_enabled` values are treated as absent.
- On create, an absent value is replaced with `{ "diamond_painting": true, "coloring_books": false }`.
- On create/update, an explicit value with both verticals disabled is rejected.
- UI clients may validate earlier for UX, but PocketBase is the cross-platform source of truth for future web/iOS clients.

## Production rollback

If the hook breaks `user_dashboard_settings` writes again:

1. SFTP to the PocketBase host.
2. Rename `pb_hooks/dashboard_settings.pb.js` to `pb_hooks/dashboard_settings.pb.js.disabled`.
3. Confirm PocketBase restarts or restart it from the host UI.
4. Verify a settings update succeeds again.

Do not roll back the collection schema just to disable this hook; the schema field can remain in place while the hook is disabled.

## Pre-deploy verification

Before redeploying the hook to production, verify against local/staging PocketBase with direct API/SDK calls:

- Empty PATCH `{}` succeeds.
- Updating only `navigation_context` succeeds.
- Creating a row without `vertical_enabled` stores the default.
- Saving each valid toggle combination succeeds.
- Saving `{ "diamond_painting": false, "coloring_books": false }` returns a structured 400.
