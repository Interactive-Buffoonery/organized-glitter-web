# ADR-0016: Send app email through Resend, server-side only

Date: 2026-06-12 (records the integration added with the feedback feature;
written down during the 2026-06 ADR backfill)

## Status

Superseded for feedback by the PocketBase feedback route (2026-09-25).

## Context

The feedback feature needs to deliver user messages by email. An email API key
can never ship to the browser, and PocketBase's built-in SMTP mail is scoped to
auth emails, not arbitrary app email.

## Decision

Resend sends app email. The key lives only in Railway service variables
(`RESEND_API_KEY`) and is used by the `api/send-feedback.js` handler
(ADR-0010), with a Resend-verified sender (`FEEDBACK_FROM_EMAIL`). When the key
is absent, the client falls back to opening the user's own email client rather
than failing silently.

Feedback emails distinguish the optional reply email from the signed-in
account email, so "no reply email" is an explicit signal, not missing data.

## Rejected Alternatives

### PocketBase SMTP for feedback

PocketBase mail settings serve auth flows; routing product email through them
would couple unrelated concerns and still need server-side templating.

### Heavier email providers (SES, SendGrid)

More configuration surface than a single transactional route justifies.

## Consequences

- All future app email has a home: an `api/` route with the server-held key.
- Email delivery depends on a Railway env var; the mailto fallback keeps
  feedback usable when it is missing (preview environments, local dev).
- CORS for the feedback route is allowlisted to known app origins.

## 2026-09-25 update

The SpaceFast Functions preview did not receive the documented outbound fetch
capability or environment bindings. Feedback now uses an authenticated PocketBase
custom route shared by web and the upcoming iOS app. The route uses PocketBase's
configured server-side mail client and never exposes delivery credentials to a
client. The earlier concern about coupling product and auth email remains; it is
acceptable for this small feedback flow because both apps already depend on
PocketBase authentication. Check the sender and SMTP provider before deploying
the hook. Resend can remain the SMTP provider; changing providers is not required.
