# Auth Service Modules

`src/services/auth.ts` is the stable public facade for app code. Keep imports from
`@/services/auth` unless a test intentionally targets a submodule.

## Modules

- `types.ts`: public auth service types.
- `state.ts`: PocketBase auth store accessors, logout, auth change subscription,
  and authenticated-user guard helpers.
- `local.ts`: email/password login and registration.
- `oauth.ts`: OAuth provider login and OAuth-only user defaults.
- `providers.ts`: configured-provider discovery, account linking, guarded
  unlinking, and modern/legacy PocketBase response normalization.
- `password.ts`: password reset and authenticated password change flows.
- `email.ts`: email verification and email change flows.
- `storage.ts`: development auth cleanup helper and browser auth storage cleanup.
- `shared.ts`: logger, email normalization, and network connectivity helpers.
- `sessionRecovery.ts`: invalid-session signals and temporary, account-bound form
  drafts held in memory for the current tab.
- `sessionDraftKeys.ts`: shared keys for forms that participate in session recovery.

## Expired web sessions

`AuthProvider` checks the token when the tab becomes visible and every minute
while it is visible. It refreshes tokens within two minutes of expiry. A failed
refresh caused by a network or server error leaves the current session in place;
an expired token or authenticated 401 starts recovery. The PocketBase client
reports protected request failures through `sessionRecovery.ts`, while
`AuthProvider` captures active drafts, clears auth and private query data, and
lets `ProtectedRoute` send the user to sign-in with the current route.

Drafts remain only in this tab's memory. The same account can restore them after
sign-in. A different account or explicit sign-out discards them. Failed writes
are never replayed automatically; the user submits again after reviewing the
restored form. If a create response confirms a record after the session clears,
recovery keeps the form and links to the created record so the user can check
any follow-up writes, such as tags, before creating another. Each form owns
its own draft fields and selected files.
Forms give `useSessionDraft` a function that captures their latest values. The hook reads saved values
during render and consumes them after mounting, so React StrictMode can initialize
a form twice without losing them. Create flows also report a confirmed base record
when recovery starts during follow-up tag requests.
Inactive token guards stay in tab memory after sign-out and account changes,
including tokens replaced by an automatic refresh:
an old write can finish after either event. Clearing or capping those guards
while requests are in flight would misclassify that write as current. The set
grows with session changes, not with requests.

## Dependency Rules

Submodules must not import from `src/services/auth.ts`; that file re-exports
submodules for app callers. Shared helpers must not import from operation modules.
This keeps the facade stable and prevents circular imports during auth startup.
