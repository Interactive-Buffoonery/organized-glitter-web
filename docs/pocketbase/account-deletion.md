# Account deletion

## Policy

Account deletion requires fresh authentication using an existing verified
sign-in method, followed by explicit confirmation. A password account verifies
its current password. An Apple account authenticates with Apple again. Any
existing verified method linked to the same account may authorize deletion.
Device unlock alone is insufficient. Account recovery handles lost access;
email support is not the normal deletion flow. Never merge accounts by email.

Delete active account records, owned library records and files. Stop sending
account-linked analytics and clear account credentials, local library data,
artwork, pending edits and queued analytics on the requesting device after
confirmed server deletion. Other devices must reject the deleted session and
clear their account data when they reconnect; remote erasure while offline is
not guaranteed.

Delete PostHog data linked to the account, including earlier anonymous events
that became linked. Keep only genuinely anonymous events and anonymous
aggregates that cannot identify a specific person. An opaque account ID or a
replacement stable ID does not make events anonymous.

Retain required financial evidence separately from app accounts. Before enabling
RevenueCat customer deletion, verify that store reports and bookkeeping preserve
necessary sales, refunds, fees, adjustments and settlement evidence. Customer
deletion does not promise a refund or deletion of the store's own records.

Keep minimal operational evidence for 30 days after cleanup completes. Keep
necessary vendor identifiers and encrypted Apple grants only while cleanup
needs them. Backups must expire within 30 days, and restoration must reapply
account deletions before the restored system serves requests. Required financial
records have their own applicable retention period. Do not publish financial
records, credentials, actual deletion receipts or production configuration.

## Implemented backend contract

The additive `POST /api/account/delete` route derives the account from a normal
PocketBase users token. Initial deletion requires a verified account and a
five-minute, account-bound proof for `delete_account`. It never accepts a target
user ID, email, signup method, feedback or usage snapshot from the caller.

Generate a cryptographically random 32-byte base64url proof (43 characters).
Keep it private, out of URLs and logs. The proof is single-use for deletion and
also authorizes completion-only retries after the account token is invalid.
Store it securely until the client has confirmed deletion.

Password verification uses the existing `POST /api/auth/step-up/password` route:

```json
{
  "action": "delete_account",
  "targetProvider": "account",
  "password": "<current password>",
  "proof": "<random proof>"
}
```

Generic OAuth verification uses the existing unauthenticated
`/api/collections/users/auth-with-oauth2` request with fresh provider credentials
and these `createData` fields. It must authenticate an existing linked provider
identity for the account, not an email match:

```json
{
  "og_step_up_action": "delete_account",
  "og_step_up_target_provider": "account",
  "og_step_up_user_id": "<current account ID>",
  "og_step_up_proof": "<random proof>"
}
```

Native Apple verification uses the existing unauthenticated
`POST /api/auth/apple/native` request. Add `deletionUserId` and `deletionProof`
to its fresh `code` and `nonce`. It rejects a different or unverified account
without creating or linking an account. Normal Apple sign-in remains unchanged.

After confirmation, send the users token and:

```json
{
  "proof": "<random proof>",
  "confirmed": true
}
```

The server transaction verifies the proof and any still-linked OAuth identity,
saves a private cleanup job, and calls PocketBase's existing user deletion.
Existing relation cascades remove owned records and attached files. Existing
Apple hooks queue encrypted grants for revocation in the same transaction.
A database or queue failure rolls back the user deletion, job and proof
consumption. No external vendor request runs inside the transaction.

The response contains only:

```json
{ "status": "deleted", "cleanup": "pending" }
```

If the response is lost, repeat the deletion request with the same proof; an
existing private receipt allows the retry without an active account session.
It performs no second deletion. A 401 with an unknown proof is not confirmation
that deletion completed. Receipt expiry ends this retry window.

`account_deletion_jobs` is inaccessible to ordinary collection clients. It keeps
an opaque account ID, proof hash, vendor completion flags and timestamps. It
contains no email, feedback, library content or detailed usage snapshot.
Pending vendor jobs survive account deletion. Completed receipts expire after
30 days once no Apple grant remains. An hourly task records `cleanup_completed` after both vendor flags are complete
and Apple grants are gone, then expires up to 100 old receipts per run. Trusted
workers must mark vendor flags complete only after verified erasure, not merely
API acceptance. Completion-only retries report `cleanup: "completed"` once all
three cleanup checks pass.

## Compatibility

Existing collection-based web and older native deletion requests remain
available under their existing verified-owner rules. Their client-created audit
and separate deletion requests are not upgraded by this route. They do not
receive the new fresh-proof or durable vendor-job guarantees. Older clients
cannot consume a deletion proof to link or unlink a sign-in provider.

New clients must use the guarded route. Replacing the older web flow requires
its own UI integration and compatibility plan.

## Remaining release gates

This backend change is not a complete App Store release implementation.

- Add the native confirmation, fresh-authentication and deletion UI. Verify
  local cleanup, pending edits, interrupted requests and account switching.
- Implement trusted PostHog and RevenueCat workers, durable retry scheduling,
  completion verification and unresolved-failure alerts. The current job is a
  handoff, not a claim of vendor erasure. Do not mark jobs complete without
  vendor evidence. Workers must preserve required accounting evidence and
  cannot guess identity links for unrelated anonymous events.
- Verify revocation requirements for linked Google and Discord identities; this
  change adds no provider revocation beyond the existing Apple worker.
- Reconcile retention of legacy web audit records before claiming the policy
  covers every deletion path.
- Verify the selected SDK's queued-event behavior. Identity reset alone is not
  proof that queued account-linked events were erased.
- Verify production backup expiry and restoration safeguards. The backend code
  cannot enforce an external provider's backup policy.
- Verify deployed backend revision, PocketBase version, Apple configuration and
  revocation worker. Pin the native backend contract only after deployment.
- Confirm applicable financial retention with the release owner. Store live
  settings, accounting records and operational evidence privately.

Legacy native Apple account remediation is outside this prelaunch scope.
Existing web Apple grants still use the shared revocation hooks.
