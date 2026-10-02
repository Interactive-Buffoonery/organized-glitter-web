# Password reset link contract

Status: implementation prepared for INT-957. The web deployment and real-device
universal-link checks are still required before the native backend revision can
claim this contract as shipped.

## Canonical link

Password reset emails use this HTTPS URL:

```text
https://organizedglitter.app/auth/confirm-password-reset/{TOKEN}
```

`{TOKEN}` is the PocketBase reset token. Clients must treat it as an opaque,
non-empty path segment. The URL path is percent-decoded once. Clients must not
apply their own token character set or length rules. PocketBase is the source of
truth for whether a token is valid.

The same URL serves both clients:

- iOS opens the native reset screen when the installed app has a verified
  association for the domain.
- The web reset page opens when iOS does not handle the link.

The web app keeps the older `/reset-password?token={TOKEN}` and
`#/auth/confirm-password-reset/{TOKEN}` redirects so reset links already in
email inboxes continue to work. New emails must use the canonical HTTPS path.
The query-token redirect reads the router's captured location so replayed
effects cannot lose the token after navigation changes the browser URL.

## iOS association

The signed app identity is:

```text
7CNK4YPCQX.com.interactivebuffoonery.organizedglitter
```

The bundle identifier is
`com.interactivebuffoonery.organizedglitter`. The application identifier prefix
`7CNK4YPCQX` was read from the generated signed app entitlement.

The web app serves the association file at:

```text
https://organizedglitter.app/.well-known/apple-app-site-association
```

It associates only `/auth/confirm-password-reset/*`. The iOS target must include
`applinks:organizedglitter.app` in
`com.apple.developer.associated-domains`.

## PocketBase confirmation

The reset screen sends an unauthenticated request to:

```http
POST /api/collections/users/confirm-password-reset
Content-Type: application/json

{
  "token": "{TOKEN}",
  "password": "{NEW_PASSWORD}",
  "passwordConfirm": "{NEW_PASSWORD}"
}
```

PocketBase returns an empty successful response. The JavaScript SDK exposes the
same operation as:

```ts
pb.collection('users').confirmPasswordReset(token, password, passwordConfirm);
```

The current clients require at least eight characters with an uppercase letter,
a lowercase letter, and a digit before sending the request. PocketBase remains
the final validation authority.

Invalid, expired, reused, and missing tokens all lead to the same safe recovery:
tell the user that the link is invalid or expired and link them to
`/forgot-password` to request a new email. Do not show or include the token in
the error text.

## Token handling

- Do not log reset tokens or attach them to analytics events.
- Redact the token segment from pageview paths and exception context.
- Do not include a token in notification text, error text, or request metadata.
- Pass the token only in the canonical URL and the PocketBase confirmation body.

## Deployment verification

After deploying the web revision, verify all of the following before updating
the native backend revision record:

1. `GET` and `HEAD` for the association URL return `200` directly over HTTPS,
   with no redirect and `Content-Type: application/json`.
2. The deployed JSON contains the exact signed app identity and reset path.
3. A newly requested reset email contains the canonical HTTPS URL.
4. The link opens the native reset screen on a physical device with the shipped
   entitlement and completes a reset.
5. The same link completes the reset in a browser when the app is not installed.
6. A reused link and an expired link both show the recovery path without token
   details.

Apple can cache association files through its managed CDN. A successful direct
fetch proves the web origin is ready, but it does not prove that every device has
received the new association yet.
