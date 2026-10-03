# Native OAuth callback association

The native app can receive the existing HTTPS OAuth callback directly through
ASWebAuthenticationSession instead of waiting for PocketBase's realtime relay.
The browser callback and the app's HTTP connection can take different network
paths; the relay rejects callbacks when their client IPs differ. Device testing
also reproduced a browser callback failure before any provider code exchange.
The precise rejection reason for that device attempt remains unconfirmed.

PocketBase serves `/.well-known/apple-app-site-association` anonymously as JSON.
Its `webcredentials.apps` contains only the signed native app identifier:
`7CNK4YPCQX.com.interactivebuffoonery.organizedglitter`.
This is an app/domain association, not a new authentication endpoint.

The native companion change must declare
`webcredentials:data.organizedglitter.app` and use an HTTPS callback matching
`data.organizedglitter.app` and `/api/oauth2-redirect`. It must validate state,
keep PKCE, exchange codes through PocketBase, and reject canceled attempts before
saving a session. Existing provider redirect URIs and web login remain unchanged.
The native change must not ship before this association is deployed and verified.

## Verification and deployment

Run `node scripts/test-native-oauth-association.mjs` to verify the anonymous HTTP
response, exact app identifier, JSON content type, and unchanged PocketBase
missing-state callback behavior against a disposable PocketBase instance.

After this backend change lands, deploy only `pb_hooks/native_association.pb.js`
using the existing PikaPod hook deployment procedure. Verify an unauthenticated
HTTPS GET on the data domain returns HTTP 200 JSON without a redirect. Confirm
Apple's association service has refreshed before installing the signed native
companion build. Do not disable PocketBase's callback IP check.

Then test Discord authorization, denial, cancellation, retry, and sign-out on a
physical device. Also verify web Discord login. Passing the route test alone is
not evidence of a successful native provider login. Rollback removes this new
hook and restores the previous native build; it does not change user records.

Apple API reference:
https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession/callback/https(host:path:)
