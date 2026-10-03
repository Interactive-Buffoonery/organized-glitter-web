# PocketBase coloring medium ownership hook

`pb_hooks/coloring_medium_ownership.pb.js` is the server-side authorization guard
for the `coloring_pages.mediums` relation.

## Contract

- The `coloring_pages` API rule authorizes writes on `book.user == @request.auth.id`
  but does not validate the targets of the `mediums` relation. Without this guard an
  authenticated user can attach another user's `coloring_mediums` record to their own
  page (an IDOR), and the coloring stats join then discloses the foreign medium name.
- `onRecordCreateRequest` rejects a create whose `mediums` references any medium the
  requester does not own.
- `onRecordUpdateRequest` only re-checks newly added medium ids (diffed against
  `e.record.original()`), so editing a page that already references owned mediums is
  never falsely rejected.
- Both hooks use request hooks (`onRecord*Request`), so the internal system saves
  performed by the metrics hooks in `coloring.pb.js` are unaffected.
- A foreign or non-existent medium id returns a structured `400` with field error
  `mediums`. Owned mediums pass through to `e.next()`.

The matching disclosure fix lives in `pb_hooks/stats.pb.js`: the two coloring medium
stats queries add `JOIN coloring_mediums m ON m.id = medium_ids.value` and
`AND m.user = {:userId}` so already-attached foreign mediums cannot leak through the
stats join. Deploy the two files together: the hook closes the write path, the stats
filter closes the read path.

## Production rollback

If the hook breaks `coloring_pages` writes:

1. SFTP to the PocketBase host (`hooks/` directory).
2. Rename `pb_hooks/coloring_medium_ownership.pb.js` to
   `coloring_medium_ownership.pb.js.disabled` (the same disable pattern used for
   `dashboard_settings.pb.js.disabled`).
3. Confirm PocketBase restarts, or restart it from the host UI.
4. Verify a normal page save with an owned medium succeeds again.

To roll back the `stats.pb.js` change, re-upload the dated pre-deploy backup left in
`hooks/` (for example `stats-before-medium-ownership-20260621.bak`).

## Pre-deploy verification

Verify against local/staging PocketBase, then re-confirm on production:

- Attaching an owned medium to your own page succeeds (`200`).
- Re-saving an already-owned medium succeeds (`200`, no false reject).
- Attaching a non-existent medium id is rejected (`400`, "do not exist").
- Attaching another user's medium id is rejected (`400`, "not owned by the current
  user"). This branch needs a second user's medium id and cannot be exercised with a
  single owner-scoped test account.
- The coloring collection stats endpoint returns owned mediums with correct counts and
  does not include foreign mediums.

## Deploy note

`pb_hooks/*.pb.js` files are committed to git, but git does not deploy them. Each hook
change must be uploaded to PikaPod over SFTP separately (see
[`docs/pocketbase/hooks.md`](./pocketbase/hooks.md)). Confirm the deployed `hooks/`
file matches the committed file so production does not lag git.
