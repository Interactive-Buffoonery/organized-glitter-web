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
confirmed server deletion. The web client also removes the deleted account's
remembered analytics choice (`og:analytics:account-consent`), so signed-out
analytics on that browser returns to the default. Other devices must reject
the deleted session and clear their account data when they reconnect; remote
erasure while offline is not guaranteed.

Delete PostHog data linked to the account, including earlier anonymous events
that became linked. Keep only genuinely anonymous events and anonymous
aggregates that cannot identify a specific person. An opaque account ID or a
replacement stable ID does not make events anonymous.

Deleting the app account does not promise a refund or deletion of the app
store's own transaction records.

Keep minimal operational evidence for 30 days after cleanup completes. Keep
necessary vendor identifiers and encrypted Apple grants only while cleanup
needs them. Backups must expire within 30 days, and restoration must reapply
account deletions before the restored system serves requests. Do not publish financial
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
an opaque account ID, optional proof hash, source kind, worker state, retry and
lease timestamps, and the PostHog target until verification. It contains no email,
feedback, library content or usage snapshot. A private target can contain linked
vendor distinct IDs, which are identifying data and must not enter logs or public
artifacts. The intended retention boundary is verified erasure, but the current
adapter cannot establish it and therefore retains the target. Pending jobs survive user
deletion and are not expired while cleanup remains unresolved.

Completion-only retries report `cleanup: "completed"` only when PostHog is
`completed` with a verification timestamp and no Apple grant remains. The hourly
retention task timestamps overall completion, then removes up to 100 receipts
older than 30 days after completion. Apple revocation remains required. A missing
or expired receipt, including an unknown-proof 401, proves neither deletion nor
that the account is intact.

## PostHog worker

**Release blocker: automatic vendor completion is unavailable.** The current
persons API cannot attribute a deletion status to this submission. The worker
keeps vendor cleanup pending or blocked, retains the private target, and never
sets `posthog_status` to `completed`. This is a deliberate fail-closed limitation,
not evidence that erasure has or has not occurred. Do not enable this adapter for
release until an attributable vendor verification protocol has been established.

The five-minute cron processes at most ten due jobs. Each HTTP request has a
ten-second timeout, outside database transactions. New deletions wait one hour
before the first attempt to allow in-flight batches to arrive. This delay does
not prove remote or offline queues are empty; client queue erasure and suppression
remain separate release requirements.

The worker uses these server-only environment variables:

| Variable                     | Required value                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `POSTHOG_ERASURE_HOST`       | `https://us.posthog.com` or `https://eu.posthog.com`, matching the actual project region |
| `POSTHOG_ERASURE_PROJECT_ID` | The project's positive numeric ID                                                        |
| `POSTHOG_ERASURE_API_KEY`    | A private API key authorized for `person:read` and `person:write` in that project        |

Never use an ingestion token as the erasure credential. Missing configuration
blocks jobs and emits a sanitized alert. There is no success or no-op fallback.
Self-hosted destinations require an explicit reviewed adapter change.

1. Claim one due row transactionally with a random token and a two-minute lease.
   Renew and compare the token before submitting and before every state write.
   An expired claim is recoverable; a stale claimant cannot overwrite its
   successor. A database write failure leaves the lease for recovery.
2. Resolve the exact PocketBase account ID as the PostHog `distinct_id`.
   Require exactly one person and no unresolved pagination. Fetch that person's
   detail record for the full authoritative linked `distinct_ids`; list and
   batch representations can truncate them. Reject missing, ambiguous or
   oversized identity manifests instead of guessing or truncating.
3. Persist the person UUID, host, project, all linked IDs, and request timestamp
   before sending `DELETE persons/:uuid/?delete_events=true&delete_recordings=true`.
   No irreversible call occurs if that save or ownership check fails. The vendor
   operation targets the whole person, including linked anonymous history.
   Before dispatch, query the current users collection for every recorded linked
   ID. If another existing user's ID is present, block as `identity_shared` and
   preserve the complete manifest for reconciliation. The check is repeated on
   retries and under the pre-dispatch lease transaction. It can detect exact
   account-ID links, not ownership hidden behind unrelated anonymous/vendor IDs;
   it cannot lock external PostHog identity merges after the final check.
4. On subsequent attempts, query `persons/deletion_status/` for that saved UUID
   first. Pending status stays pending. A completed status with a verification
   timestamp blocks as `verification_attribution`, since the API does not tie it
   to this submission. Old-only status, mixed history, and clock skew never
   certify completion. A changed project or region blocks the job rather than
   redirecting its target.
5. API acceptance, an empty status response, a missing person, and a 404 never
   mean completion. An empty status response retries the same saved UUID;
   uncertain or missing targets remain private and unresolved for reconciliation.

Backoff starts at 15 minutes, doubles to a 24-hour cap and is stored in the job.
A 429 also honors a longer valid `Retry-After` delay, including HTTP dates;
there is no one-day cap on a valid vendor delay. An unrepresentable delay or date
beyond year 9999 blocks as `rate_limit_invalid`, stores a one-day retry, releases
the lease, and schedules an alert instead of throwing during persistence.
401/403, malformed responses, missing identities and configuration mismatch are
blocked and retried durably. Pending verification is retried without resubmission
while the vendor reports a matching pending request.

Alert scheduling uses `next_alert` independently of `next_attempt`. New jobs
become alert-eligible after 14 days; blocked outcomes become eligible immediately
subject to 24-hour per-job suppression. Every cron run selects at most 100 due
alerts through a partial index excluding completed receipts, updates their next
alert time durably, and emits one aggregate warning with a total and allowlisted
reason counts. Missing-person jobs remain blocked and visible without a daily
per-job message flood. The oldest due alert is considered first. A valid year-long
vendor rate limit does not delay alerts or cause an earlier vendor request.

Warnings never include job IDs, account IDs, linked IDs, proofs, credentials or
vendor bodies. Operators must route these warnings, monitor cron liveness and
inspect the private queue; logging is not proof of delivery. Do not manually
mark a job completed to silence an alert. Claim scheduling uses a partial
`(next_attempt, created, id)` index excluding completed receipts. Audit retention
has a separate `created` index. Tests exercise the actual claim SQL in PocketBase
with 100,000 retained receipts and the real audit retention path with 100,000
synthetic audit rows; no production backlog or timing is inferred.

API sources checked for this implementation:
[PostHog persons](https://posthog.com/docs/api/persons),
[deletion and verification](https://posthog.com/docs/privacy/data-storage), and
[person serialization and full detail retrieval](https://github.com/PostHog/posthog/blob/master/posthog/api/person.py).
Current primary source was also inspected at PostHog commit
`069e3b3acc87cc880fa0b13423d9c450d36674d2`:

- [AsyncDeletion model](https://github.com/PostHog/posthog/blob/069e3b3acc87cc880fa0b13423d9c450d36674d2/posthog/models/async_deletion/async_deletion.py)
  has a uniqueness constraint on deletion type and person UUID.
- [Event deletion queue](https://github.com/PostHog/posthog/blob/069e3b3acc87cc880fa0b13423d9c450d36674d2/posthog/models/person/bulk_delete.py)
  ignores conflicting inserts instead of returning a fresh request identifier.
- [Persons API and status serializer](https://github.com/PostHog/posthog/blob/069e3b3acc87cc880fa0b13423d9c450d36674d2/posthog/api/person.py)
  return an empty 202 for single-person DELETE; status contains person UUID,
  creation time, status and verification time, but no operation identifier.

Consequently an old completed row can survive another deletion attempt. A
PocketBase timestamp, arbitrary clock tolerance, accepting any completed row or
subtracting a preflight history snapshot does not establish current-request
attribution under deduplication or concurrent vendor operations. This adapter
needs a documented vendor operation identifier or another verifiable protocol
before it can produce completion. Source inspection is not deployed-project
verification. The existing receipt completion/Apple/retention contract is retained
for a future verified producer, but this worker cannot satisfy it today.

## Compatibility and legacy retention

Existing collection-based owner and superuser user deletes remain available.
A model deletion hook explicitly wraps job creation and `e.next()` in the same
transaction, including the existing relation cascades and Apple grant queue.
Failure to create the job prevents deletion; failure later in deletion rolls the
job back. The guarded route inserts its job first and the hook reuses it. A unique
user index prevents duplicate jobs.

Legacy paths have `source_kind: "legacy"` and an empty optional `proof_hash`.
They gain durable vendor cleanup but do not gain fresh-proof authorization or a
completion retry credential. No proof is fabricated. Guarded jobs use
`source_kind: "guarded"` and a unique nonempty proof hash. New clients must use
the guarded route; older clients retain their verified-owner rules.

Legacy `account_deletions` rows are records of attempts, including failed or
abandoned attempts, not evidence that a user was deleted. Their PII expires by
creation time, independent of account existence. The hourly retention job
removes up to 100 rows older than 30 days per run. Backlogs can take multiple runs;
monitor them before claiming the 30-day policy is satisfied. No historical audit
is used to infer a successful deletion or backfill a vendor job. Historical
accounts deleted before this hook need separate evidence-based reconciliation.
This source change performs no production audit purge.

## Deployment and remaining release gates

Deploy the forward migration `1792281600_account_deletion_worker.js`, canonical
schema, and current hooks together. Historical migrations remain immutable. The
forward migration removes the unused vendor field and adds worker state; there
is no second vendor worker or configuration requirement. Existing receipts are
preserved. Earlier manually completed PostHog flags lack verification evidence,
so the migration requeues them and clears overall completion. Destructive down
migration is refused while durable receipts and targets may exist.

Local fixture tests use checksum-verified PocketBase and a loopback vendor. They
prove transaction behavior and worker transitions only. They do not prove vendor
erasure or a deployed backend revision. Before release:

- Run the required local backend-first validation and strict combined `test:pr`.
  Integrate client and native work, including malformed responses, uncertain
  requests, account/session fencing and local cleanup failures.
- Resolve the current-request attribution blocker before enabling release.
  Exercise the adapter in an explicitly authorized disposable vendor project.
  Confirm region, scopes, full linked identity coverage, request and verification
  semantics, personless identified events, late events and session recordings.
  Until resolved with evidence, no-person jobs stay blocked.
- Verify exact SDK offline queue erasure and suppression on every client. A reset
  alone or a one-hour worker delay is insufficient proof.
- Verify Google and Discord revocation applicability. Existing Apple revocation
  and its encrypted grant queue still gate overall completion.
- Verify alert routing, worker liveness and an owner for unresolved jobs. Track
  legacy audit backlogs and historical deletion reconciliation privately.
- Verify backup expiry within 30 days and rehearse restore while ingress and
  workers are blocked. Reapply the deletion ledger held outside the snapshot,
  including pending targets, before service resumes. Cover a pre-migration
  snapshot; migration alone cannot reconstruct post-snapshot deletions.
- Verify deployed backend revision, hook/migration hashes, PocketBase version,
  configuration and Apple worker. Pin the native backend contract only after
  deployment is independently verified. This change makes no deployed pin claim.

Keep live settings, deletion ledgers and operational evidence private. Legacy
native Apple account remediation is outside this prelaunch scope; existing web
Apple grants still use the shared revocation hooks.
