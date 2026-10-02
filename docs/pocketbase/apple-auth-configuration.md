# Private Apple configuration

Native Apple sign-in and web Apple grant capture read one private JSON file:
`<PocketBase data directory>/apple-auth-private/config.json`. On the current
PikaPods SFTP layout this is `/data/apple-auth-private/config.json`.

No custom environment variables are required. The native bundle ID remains
`com.interactivebuffoonery.organizedglitter` in `native_apple.js`. The web
Services ID and web OAuth client secret remain in PocketBase's provider settings.

## Provisioning

Use [the placeholder template](apple-auth-config.example.json) as the shape,
not as a working configuration. Prepare the real file outside the repository.

- `teamId`: Apple Developer Team ID, 10 uppercase letters or digits.
- `keyId`: identifier of the Sign in with Apple signing key, same format.
- `privateKey`: complete Apple `.p8` PEM contents, encoded as a JSON string.
- `grantEncryptionKey`: independent, cryptographically random 32-character ASCII
  key. For example, encode 24 random bytes as base64 in a provisioning program
  that writes directly to the private file without printing its contents.

An existing web signing key can be reused only if configured for the primary
App ID associated with the native app and the web Services ID. A successful
local signing check does not verify this Apple portal association.

If grants already exist, preserve their encryption key. Never automatically
create a replacement for a missing key or rotate it without a grant migration.
A missing key prevents decrypting old tokens for revocation.

1. Keep a separate protected recovery copy outside the repository and outside
   ordinary database backups. Limit directory access to its owner (0700) and
   file access to its owner (0600).
2. Deploy `apple_config.js` and `apple_config_backup.pb.js` first. Confirm the
   backup hook is loaded before placing credentials in the data directory.
3. Create `/data/apple-auth-private` with mode 0700. Upload the configuration
   as a temporary file inside this directory, set mode 0600, compare its bytes
   privately, then rename it to `config.json`. Keep temporary copies in this
   excluded directory, never beside it or in public/upload storage.
4. Verify PocketBase can read it as the file owner. Do not broaden group or
   public access to work around an ownership mismatch. The runtime rejects it.
5. Deploy the updated `native_apple.js` and `apple_grants.pb.js` consumers.
6. Check health and native readiness, confirm the file is not available over
   HTTP, and inspect a new PocketBase backup for the absence of the entire
   `apple-auth-private/` directory. Finish with real device Apple sign-in.

The file is read per request. It is parsed as JSON, never executed as JavaScript.
Missing, malformed, oversized, symlinked, or permissive configuration closes
native readiness and exchange. Web sign-in continues during rollout but cannot
capture grants if configuration is invalid. The public response never includes
configuration details. Server logs report fixed `apple_config_*`,
`apple_provider_unavailable`, `apple_rate_limits_unavailable`, or
`apple_grant_collection_unavailable` reasons without underlying exceptions.

## Backup and recovery

`apple_config_backup.pb.js` excludes `apple-auth-private` during both backup
creation and restore. This keeps keys out of generated PocketBase archives and
preserves the current private directory when an existing installation restores
its database. Both hooks call the normal PocketBase operation afterward.

For recovery onto a new host, install the hooks and restore the separate private
configuration copy as well as the database. Match the encryption key to the
grants in that database. Never restore production keys into a test environment.

These exclusions do not affect provider snapshots, full-disk backups, or manual
copies. Protect those separately. An attacker with access to the running
PocketBase process or sufficient host/SFTP privileges can read the file. Grant
encryption protects a database-only leak, not a full server compromise.

The runtime test `node scripts/test-native-apple-auth.mjs` uses disposable keys
and a real PocketBase 0.40.4 server. It checks invalid configuration, permissions,
symlinks, HTTP exposure, backup exclusion, restore preservation, and the existing
authentication and grant flows. Its output directory contains `result.json`.
