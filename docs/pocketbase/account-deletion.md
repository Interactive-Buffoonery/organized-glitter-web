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

**Release blocker: automatic vendor completion is unavailable.** This adapter has
no proven verification protocol covering the person profile, events and recordings.
An empty status preflight is a candidate for establishing fresh event coverage by
request ordering, under assumptions described below; it is not full-scope proof.
The worker keeps cleanup pending or blocked, retains the private target, and never
sets `posthog_status` to `completed`. Keep the erasure environment variables unset
until a full-scope completion protocol is established and independently verified.
No current state proves that erasure has or has not occurred.

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
   oversized identity manifests instead of guessing or truncating. Encode the
   complete target, including host/project/UUID metadata, to UTF-8 bytes using
   PocketBase `toBytes`. The 240,000-byte guard leaves 10,000 bytes below the JSON
   field limit. A larger target blocks as `identity_oversized`, schedules an
   immediate alert, and never reaches DELETE; no linked ID is truncated.
3. Persist the person UUID, host, project, all linked IDs, and request timestamp
   before sending `DELETE persons/:uuid/?delete_events=true&delete_recordings=true`.
   No irreversible call occurs if that save or ownership check fails. The vendor
   operation targets the whole person. Coverage of all linked anonymous history
   still requires vendor verification.
   Before dispatch, query the current users collection for every recorded linked
   ID. If another existing user's ID is present, block as `identity_shared` and
   preserve the complete manifest for reconciliation. The check is repeated on
   retries and under the pre-dispatch lease transaction. It can detect exact
   account-ID links, not ownership hidden behind unrelated anonymous/vendor IDs;
   it cannot lock external PostHog identity merges after the final check.
4. On subsequent attempts, query `persons/deletion_status/` for that saved UUID
   first. Pending status stays pending. A completed status with a verification
   timestamp blocks as `verification_attribution`, since the API does not tie it
   to full-scope verified erasure in this adapter. More than one row for the saved
   UUID violates the inspected vendor uniqueness contract and blocks as
   `vendor_shape`. Old-only status and clock skew never certify completion.
   A changed project or region blocks the job rather than
   redirecting its target.
5. API acceptance, an empty status response, a missing person, and a 404 never
   mean completion. Before repeating DELETE after an empty status, retrieve the
   same saved person's full detail again. If retrieval fails, a recorded ID is
   missing (`identity_changed`), the refreshed target is oversized, or a linked
   ID belongs to another existing user (`identity_shared`), block and preserve the
   original durable target. Safe additions are saved in the full refreshed
   manifest before dispatch, followed by the transactional shared-ID and lease
   check. A save failure prevents DELETE. This narrows the retry merge window but
   cannot prevent external merges after the final retrieval/check.
6. A plausible partial vendor failure can return 503 while queuing event deletion
   and leaving the person profile present. Pending event status currently stays
   unresolved without another DELETE; completed event status remains blocked.
   The fixture models this case and proves no false completion, not vendor
   transaction semantics or profile recovery. A future producer must separately
   establish profile absence via detail 404 and handle a surviving or recreated
   profile safely; event verification alone cannot do this.

Backoff starts at 15 minutes, doubles to a 24-hour cap and is stored in the job.
A 429 also honors a longer valid `Retry-After` delay, including HTTP dates;
there is no one-day cap on a valid vendor delay. An unrepresentable delay or date
beyond year 9999 blocks as `rate_limit_invalid`, stores a one-day retry, releases
the lease, and schedules an alert instead of throwing during persistence.
401/403, malformed responses, missing identities and configuration mismatch are
blocked and retried durably. Pending verification is retried without resubmission
while the vendor reports pending events for the saved person.

Alert scheduling uses `next_alert` independently of `next_attempt`. New jobs
become alert-eligible after 14 days; blocked outcomes become eligible immediately
subject to 24-hour per-job suppression. Every cron run selects at most 100 due
alerts through a partial index excluding completed receipts and emits one
aggregate warning with a total and allowlisted reason counts before committing
suppression. A stop before emission leaves rows eligible. A failure after emission
but before commit can emit duplicates on recovery; that is intentional local
at-least-once emission behavior. The logger call does not acknowledge external
transport or delivery. Successful local emission then commits next eligibility.
Missing-person jobs remain blocked and visible without a daily
per-job message flood. The oldest due alert is considered first; 24 hours is
suppression/eligibility, not guaranteed notification cadence. A valid year-long
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

The same pinned source also establishes:

- [Synchronous single-person dispatch](https://github.com/PostHog/posthog/blob/069e3b3acc87cc880fa0b13423d9c450d36674d2/posthog/api/person.py#L993-L1020)
  queues the event row before returning 202. Status for one person is zero or one
  row, not a history list. The former mixed-history fixture is now an unexpected
  vendor-response test.
- [Event deletion and verification conditions](https://github.com/PostHog/posthog/blob/069e3b3acc87cc880fa0b13423d9c450d36674d2/posthog/models/async_deletion/delete_events.py#L143-L189)
  use the row's `created_at` cutoff. Person UUIDs are deterministic and can be
  reused; conflicts do not refresh that cutoff for a recreated person.
- [Completion marking](https://github.com/PostHog/posthog/blob/069e3b3acc87cc880fa0b13423d9c450d36674d2/posthog/models/async_deletion/delete.py#L33-L48)
  records event verification. Recording deletion uses a separate workflow and
  has no verification status in this person-status response.

An empty-preflight candidate could persist an empty status observation under the
lease immediately before dispatch. Assuming reads see committed rows and rows
are not rewritten, a later row would have been inserted after that observation,
without comparing PocketBase and vendor clocks. A pre-existing row must block
that candidate because deduplication preserves the old coverage cutoff. A
concurrent deletion between preflight and submission can establish an earlier
cutoff than this submission, leaving that interval and later events uncovered.
Read consistency, rewrite behavior and the concurrency/late-event boundary need
authorized vendor evidence. This event-only candidate is not implemented and
does not establish full-scope deletion.

Profile absence, recording verification, late and personless events, and history
stored under pre-merge person IDs remain unresolved. Source inspection does not
prove the actual project's behavior. This worker does not implement the candidate
or any completion transition; `verification_attribution` remains its conservative
unresolved-completion reason, not a claim that event attribution is impossible.
No arbitrary clock tolerance or manual completion flag is permitted.
The existing receipt completion/Apple/retention contract is retained for a future
verified producer, but this worker cannot satisfy it today.

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

## Capacity and operational acceptance

Current bounded ceilings assume every cron runs successfully: 100 audit deletes
per hour (2,400/day), 100 alert rows per five minutes (28,800/day), and ten vendor
claims per five minutes (2,880/day). Retries consume claim capacity. Synthetic
100,000-row backlogs imply at least 41.7 days to drain expired audits or 3.47 days
to circulate due alerts at those ceilings. These are arithmetic projections, not
observed production workloads or demonstrated service rates. The current tests
prove query plans and bounded batches only.

The retention policy target remains expiry by 30 days, meaning zero expired-audit
lag; hourly selection alone cannot guarantee that deadline. Do not claim the
30-day policy is met. Before deployment, an operator must measure expected peak
expiry arrivals, existing backlog, oldest expired creation time, and actual drain
rate, then demonstrate a bounded retention schedule that meets the policy. Any
required cadence/batch change needs its own scoped implementation and validation.
This patch changes neither retention batch size nor cadence.

Alert acceptance target: oldest due alert age at most 15 minutes under the
expected peak unresolved population, including retries and outage recovery.
This is an engineering acceptance target, not a measured result or a guarantee
from `next_alert`. Independently monitor due-alert count/oldest `next_alert`,
expired-audit count/oldest `created`, due-claim count/oldest `next_attempt`, and cron
liveness. Report oldest expired age beyond the 30-day cutoff as retention lag;
report alert age beyond `next_alert` as notification eligibility lag. Keep metrics
aggregate and never export account IDs or manifests. Gate rollout on measured
capacity, configured queue-age alarms, verified external alert routing and a
named operational owner. Those gates are currently unverified.

With no completed producer, blocked jobs remain retained and eventually retry.
Do not enable vendor configuration while this limitation remains; daily retries
can exhaust the claim budget. No terminal parking state or indefinite-PII cleanup
claim has been introduced. Missing configuration prevents external calls but does
not eliminate the need to monitor retained private jobs and cron capacity.

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
- Resolve the full-scope verification blocker before enabling release.
  Exercise the adapter in an explicitly authorized disposable vendor project.
  Confirm region, scopes, full linked identity coverage, request and verification
  semantics, personless identified events, late events and session recordings.
  Until resolved with evidence, no-person jobs stay blocked.
- Verify exact SDK offline queue erasure and suppression on every client. A reset
  alone or a one-hour worker delay is insufficient proof.
- Verify Google and Discord revocation applicability. Existing Apple revocation
  and its encrypted grant queue still gate overall completion.
- Meet the capacity/queue-age targets above; verify alert routing, worker liveness
  and an owner for unresolved jobs. Track
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
