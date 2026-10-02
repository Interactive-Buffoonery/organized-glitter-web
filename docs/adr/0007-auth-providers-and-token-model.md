# ADR-0007: Authenticate with PocketBase auth: email/password and OAuth

Date: 2026-06-12 (contract set 2026-05-16 as `docs/AUTH_CONTRACT.md`; folded
into this ADR during the 2026-06 ADR backfill)

## Status

Accepted. Supersedes `docs/AUTH_CONTRACT.md` (retired).

## Context

Authentication must work for existing users (some of whom are Discord-only),
keep sign-up friction low, and stay portable to a possible native client
(ADR-0011) without a second identity system. PocketBase already provides auth
collections, OAuth providers, and JWT issuance (ADR-0001).

## Decision

PocketBase is the only identity system. The `users` auth collection backs every
client.

Providers:

- **Configured in production on 2026-09-20:** Google, Discord, and
  email/password. Web Apple was enabled later; native Apple uses separate
  credentials and remains a release prerequisite.
- **Supported by the PWA:** Apple, Google, and Discord. Login and registration
  render only providers returned by `users.listAuthMethods()`.
- **App Store constraint:** if a native iOS app ships while third-party social
  logins (Google, Discord) are offered, Sign in with Apple becomes mandatory.

The web provider union already includes the full target set:

```ts
export type OAuthProvider = 'apple' | 'google' | 'discord';
```

### Web password fields

The login password input uses `autocomplete="current-password"`. Registration
uses `autocomplete="new-password"` for both password inputs, so password managers
can distinguish signing in from creating credentials.

### Account continuity

- Discord OAuth must remain enabled: existing users may have Discord-only
  accounts, and they must keep signing into the same PocketBase user record on
  every client.
- OAuth identity maps to the PocketBase external auth record for the same
  provider and provider ID.
- Provider linking starts from an authenticated Account settings session. The
  user must first verify a current password or an exact already-linked OAuth
  identity. The five-minute proof is single-use and bound to the current user,
  action, and target provider. The server consumes it when the link attempt
  reaches the OAuth hook and forces completion to stay on that user record. If
  the provider identity belongs to another user, the request fails with an
  account conflict.
- An unauthenticated OAuth request never attaches to an existing record only
  because the provider reports the same email. The user must sign in to the
  existing account first and connect the provider from Account settings.
- Existing provider identities keep working, including Discord-only accounts.
- Ordinary OAuth sign-in and signup may omit `createData`. The hook treats it
  as empty; authenticated provider linking still requires a fresh proof.

### Linking and unlinking

- Account settings lists Apple, Google, and Discord from the configured and
  linked PocketBase provider data. A linked provider remains visible if an
  administrator later disables it.
- Users unlink through `DELETE /api/auth/external-auths/{provider}`. Direct
  owner deletion of `_externalAuths` records is blocked by a request hook.
  PocketBase 0.40.1 rejects system collection rule changes, so the owner delete
  rule cannot be set to `null` in a migration.
- The server loads the current user and external auth records inside one write
  transaction. It consumes a fresh proof and deletes a provider only when
  another configured provider remains or the user proved a known password.
- A nonempty password hash is not proof of password access. PocketBase creates
  a random required password for OAuth-only records. The final provider unlink
  therefore relies on a proof minted by explicit password validation instead of
  checking only for a stored hash. OAuth-only users can verify with an existing
  linked provider, but cannot remove their final configured provider that way.
- Proof rows are server-only, store a SHA-256 proof hash, expire after five
  minutes, and are replaced per user, action, and provider. Password failures
  use a persistent per-user five-attempt, ten-minute window.

### Verification policy

- Password authentication and all protected application APIs require the
  `users.verified` field to be true.
- OAuth authentication remains valid for OAuth-only accounts. PocketBase 0.40.1
  marks a user verified during the OAuth transaction when the provider email is
  empty or matches the user record. The verification-policy migration also
  marks existing users with an `_externalAuths` link as verified before it
  enables the auth rule.
- `verified` means the account may use protected application APIs. It does not
  prove that the user knows the record password because PocketBase assigns a
  random password to OAuth-created records.
- The verification-policy migration rotates the users collection auth-token
  secret when it enables the verified auth rule. Changing `authRule` alone
  does not revoke issued JWTs. After that rotation, existing user tokens must
  authenticate again. Old unverified tokens fail as invalid tokens, and an
  unverified password login receives a forbidden response before PocketBase
  returns a new token.
- Business collection rules and custom application routes also check
  verification. This keeps the policy in effect if an unverified user obtains
  an authenticated request context through a future auth path or a local
  configuration mistake.

### Token model

- PocketBase returns a JWT after password or OAuth authentication.
- Each client stores the token in its platform-appropriate secure store; web
  keeps the PocketBase auth store behavior.
- Clients should call `authRefresh` before token expiry or on returning to the
  foreground.
- Logout clears the local token and user-scoped local cache; account deletion
  clears tokens once the deletion is accepted.

### Error mapping

Clients map raw PocketBase/auth failures into user-facing categories:

| Case                                                     | User-facing category |
| -------------------------------------------------------- | -------------------- |
| Wrong password, invalid token, expired token             | Auth failed          |
| Provider disabled or not returned by `listAuthMethods()` | Provider unavailable |
| Popup blocked on web                                     | Web popup blocked    |
| Popup closed or deep link cancelled                      | Sign-in cancelled    |
| Network unavailable or timeout                           | Network failure      |
| Duplicate, email-matched, or unlinked identity           | Account conflict     |
| Expired, replayed, or wrong-scope action proof           | Fresh proof required |
| Final provider unlink without password proof             | Continuity required  |
| 5xx or unexpected PocketBase response                    | Service unavailable  |

### Provider setup

Enable the provider in the `users` auth collection, configure client ID,
secret, and allowed redirect URLs, and verify `users.listAuthMethods()` returns
it in each environment. The PocketBase OAuth callback registered with Apple,
Google, and Discord is the backend URL for that environment:
`https://<pocketbase-host>/api/oauth2-redirect`.

The PWA opens the provider flow from its deployed origin and completes it
through PocketBase realtime auth. Web Apple uses its service ID, domain, key,
and PocketBase callback. Native Apple uses the system authorization sheet and
the code-exchange route below; it requires its own App ID association and
backend credentials. These two configurations must be verified separately.

### Native Apple code exchange

The iOS app uses the native Apple authorization sheet. The backend offers public
`GET /api/auth/apple/native/readiness` with only `{ "available": boolean }` and
guest-only `POST /api/auth/apple/native` with `{ "code", "nonce", "name"? }`.
The nonce is the raw value whose SHA-256 hex digest iOS sent to Apple. The
optional name has `givenName` and `familyName` strings and is never identity
authority. The route rejects client-supplied identity fields.

The route creates a five-minute Apple client secret from server-only native
credentials. It initializes a fresh copy of the configured PocketBase Apple
provider, changes only that instance to the native client ID and secret, fixes
its token URL to Apple's endpoint, and leaves the redirect URL empty. The
provider validates the signed ID token against Apple's keys, issuer, native
audience, and expiry. The route also compares the signed nonce claim to the
attempt digest. The configured web provider remains unchanged.

An existing Apple external identity selects its linked user. An email match
without that link returns 409 and never attaches the identity, including a
case-only email match against a mixed-case stored address. A new user is
created with a random password and the provider link in one transaction.
PocketBase 0.40.4's [Apple provider](https://github.com/pocketbase/pocketbase/blob/v0.40.4/tools/auth/apple.go)
sets `AuthUser.Email` only when the signed `email_verified` claim converts to
true, including Apple's boolean and string representations. The native route
uses this filtered email, not the raw claim. Recheck that provider behavior on
PocketBase upgrades. The disposable fixture substitutes provider results; it
does not independently verify the signed email claim.

PocketBase's current `users.email` field is required. A first Apple sign-in
without a provider-verified email returns 400 and creates no account; the user
can use another sign-in method. The same required-email validation rejects
missing-email signup through standard OAuth in PocketBase 0.40.4. A linked user
can still sign in if Apple omits email on a later authorization. OAuth's
verified-account policy and unverified-account password and link transitions
apply to the native route only when the stored email can be verified by the
provider. An unverified linked record with a different or missing Apple email
is rejected before its password, links, or grants can change. The standard PocketBase OAuth auth response enforces
the users auth rule and shared auth hooks.

When a matching Apple email verifies an unverified linked account, the route
replaces its password and removes its other provider links before keeping the
authenticated Apple link. PocketBase 0.40.4 uses the same transition to prevent
someone who created the unverified account from retaining password or provider
access after the email owner signs in. Verified accounts keep their password
and other provider links. Temporary 503 responses include `Retry-After: 30`.

The current native route uses `RecordUpsertForm` for new-user validation and
record save hooks. PocketBase's private internal OAuth create-request function
is unavailable to JSVM. There is no current `users` create-request hook in this
repository. Any new one must be added to both paths and the disposable auth
test. The route has a 4096-byte request limit, an explicit five-per-minute
guest exchange rate rule, and a twelve-per-minute readiness rate rule. Invalid
grants and claims return 400; provider outages and configuration failures
return 503. The disposable test exercises a fresh provider instance and real
OAuth token-exchange errors, but substitutes test claims for Apple's signed
ID token. Signed Apple exchange and device behavior still require deployment
verification. PocketBase 0.40.4 exposes structured token-exchange status and
provider error codes to JSVM, but its Apple JWKS verifier wraps validation and
transport errors without a typed JSVM distinction. The route treats every
failure in that verifier stage as retryable with the route-owned
`apple_unavailable` reason. Structured invalid token-exchange responses and the
route's own identity and nonce checks remain authorization failures. Responses expose stable
`apple_authorization_failed` and `apple_unavailable` reason codes. Revisit the
classification with any PocketBase upgrade.

### Apple grant custody and deletion gate

`apple_oauth_grants` is server-only. It associates a user ID, SHA-256 provider
identity hash, and Apple client ID with an AES-256-GCM encrypted refresh token.
`grantEncryptionKey` is a separate 32-character ASCII secret in the private
server configuration file. Retain a protected recovery copy while any grant may
need revocation. PocketBase backup and restore hooks exclude its directory;
host snapshots and manual copies require separate protection. See
[configuration and recovery](../pocketbase/apple-auth-configuration.md). Never include it in source, client configuration, or logs. A new
nonempty grant replaces the previous grant for the same identity and client ID;
an absent refresh token leaves a stored grant unchanged. Native identity and
grant writes share one transaction. The grant collection has no client API
access and is absent from auth responses.

Durable grant custody is required for Apple identity creation and linking.
Identity and grant writes share one transaction, so a storage failure cannot
leave an authenticated identity without a revocable grant. Deletion and unlink
queue revocation in the same transaction as removing account access. Encrypted
grants survive deletion only until Apple confirms revocation; they cannot
restore account access. Pending and orphaned grants block new sign-in.

The canonical [Apple grant operations](../pocketbase/hooks.md#apple-grant-operations)
section defines capture rules, query and worker limits, retry state, restart
recovery, rollout audit commands, and key retention. Keep operational changes
there rather than repeating them in this ADR.
Historical missing grants and real-device Apple behavior still require a
separate release check. The custom native route is unavailable until Apple is
enabled on users, the native credentials and encryption key are valid, the grant schema
exists, and the rate rule is active. The Apple migration adds and removes only
its route rules; it preserves the global `rateLimits.enabled` setting on both
upgrade and rollback. Enable rate limiting explicitly in the PocketBase settings
before enabling native sign-in. This avoids enabling unrelated rules as a side
effect of installing Apple support or disabling their protection on rollback. Source readiness does not prove deployed
provider or device flows.

## Rejected Alternatives

### A separate identity provider (Auth0, Clerk, Supabase Auth)

A second identity system would have to be bridged to PocketBase records and
rules, adding cost and a synchronization problem for no capability the app
needs.

## Consequences

- Auth implementation stays behind the `src/services/auth.ts` facade with
  focused modules under `src/services/auth/`.
- Web Apple uses the existing PocketBase provider flow. Native Apple also
  requires a separate code exchange, native credentials, and a deployment gate.
- Discord cannot be retired without an account-migration plan for Discord-only
  users.
- `docs/API_CONTRACT.md` defers to this ADR for provider and token
  expectations.
