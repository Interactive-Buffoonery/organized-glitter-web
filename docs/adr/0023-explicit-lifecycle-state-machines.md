# ADR-0023: Make lifecycle and multi-step UI states explicit

Date: 2026-11-05

## Status

Accepted.

## Context

Several parts of the app have one thing that can only be in one situation at a
time, but the code tracks it with separate fields and flags. This allows
combinations that should not exist and hides the rules from anyone reading
the code. An audit of `dev` at `ea4e768` found these:

| Area                                | Where the state lives today                                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project, book, and page lifecycle   | `status` plus date fields. Server rule in `pb_hooks/sort_proxy_helpers.js` (projects) and `pb_hooks/coloring.pb.js` (books, pages).                                                    |
| Date-driven status in edit forms    | `useCompletionDateStatus` ref, a prop, a callback, and the saved draft field `statusBeforeDateChange`.                                                                                 |
| Project image field and crop dialog | `imageFile`, `imageUrl`, `imageRemoved`, `preview`, `cropFile`, `isCropDialogOpen`, and two version refs in `ProjectFormSections.tsx`. Similar flags in `ProjectCoverImageEditor.tsx`. |
| Bulk photo import                   | `loading` (used for both analysis and import), `rows`, `library`, `lastResult`, `readyAnalysisId`, and two refs.                                                                       |
| Randomizer result                   | A `useReducer` that merges any partial object.                                                                                                                                         |
| Recoverable drafts                  | `decision.ready`, `decision.key`, and the `retired`, `ownsDraft`, and `latest` refs.                                                                                                   |
| Mystery page reveal                 | `revealed_subject` and `revealed_at`, which should be set or cleared together.                                                                                                         |

The current lifecycle policy is written in
[`../lifecycle-date-status.md`](../lifecycle-date-status.md):

- Saving a new completion date marks a project, book, or page Completed,
  unless it is Archived or Destashed.
- Changing status never creates, replaces, or clears a date.
- Clearing a completion date leaves status unchanged.
- Archive restore keeps the archived status and dates.

The server applies this rule for every client, including the native app and
imports. The project version lives inside the sort proxy helper rather than in
its own lifecycle hook. Coloring has its own copy of the same rule, and the web
form has a third.

The form copies the server. While a new completion date is entered, picking
a status other than Archived or Destashed snaps back to Completed, because the
server would set Completed on save anyway. The behavior is consistent, but the form doesn't say why it happens.

Stats count a project as finished when `date_completed` is set, whatever its
status ([`../stats-spec.md`](../stats-spec.md)). Since changing status keeps
the date, a project moved from Completed back to Wishlist still counts toward
"All-time completed."

## Decisions to make

### D1. Where the server lifecycle rule lives

- **A. Leave it where it is.** No change. The project rule stays inside the
  sort proxy helper, with a separate copy for coloring.
- **B. One shared lifecycle helper (recommended).** Move the rule into
  `pb_hooks/lifecycle_status.js` and call it from the project, book, and page
  hooks. The sort proxy helper only computes sort fields. Behavior stays the
  same, the rule becomes easy to find, and it gets its own backend tests.

### D2. What a completion date means after a record leaves Completed

- **A. Keep the date and count it (current).** The date is a historical fact.
  Stats count the project as finished even if it later moves to Wishlist or
  On hold.
- **B. Keep the date, but count only Completed records.** The date is still
  stored, but stats only count a project as finished when its status is
  Completed. This also changes `stats-spec.md`.
- **C. Clear the date when status moves away from Completed.** Status and
  dates always agree. This changes the documented rule that status changes
  never touch dates, and the native app and imports have to follow it too.

Recommendation: A or B. Pick A if "I finished this once" should always count.
Pick B if the library and stats should always agree. C loses data that people
may have entered on purpose.

### D3. Form behavior when someone picks another status after entering a new completion date

- **A. Keep the snap-back and explain it (recommended).** Show a short hint
  under Status, such as "Clear the completion date to change the status."
  This needs no server change.
- **B. Picking another status clears the newly entered date.** The person's
  pick wins, and the saved date is restored. This is a different rule from
  the server's, so the form has to explain the change.
- **C. Change the server so an explicit status in the same save wins.** This
  touches every client and needs care with inline date saves, which send only
  the date.

### D4. How to model multi-step UI states

- **A. Discriminated unions with a pure transition function (recommended).**
  For example: `type BulkPhotoState = { phase: 'idle' } | { phase: 'analyzing'; id } | ...`
  and `next(state, event)`. Test the transition function directly. This
  follows `FeedbackDialog.tsx`, `useDetailRetryState.ts`, and
  `ColoringPageCommand`, which already work this way.
- **B. Add a state machine library such as XState.** It brings visual tools
  and strict typing, but it's a new dependency to learn and adds weight to
  the bundle for flows this small.

### D5. Scope and order

Proposed order, each as its own PR with tests written first:

1. Lifecycle: D1, D2, and D3. This touches `pb_hooks/`, so it needs
   `VALIDATION_BASE_REF=origin/dev pnpm pb:validate:local` before the PR.
2. Project image field (`ImageChange = keep | replace | remove`) and crop
   dialog state.
3. Bulk photo import phases.
4. When someone is already working in that code: the randomizer result,
   recoverable draft phases (named states, no rewrite), and an
   `isPageRevealed` helper plus a server check that reveal fields are set or
   cleared together.

Open question: should items 2 and 3 wait until the lifecycle work lands, or
can they go in parallel?

## Decision

- **D1: B.** Move the server rule into a shared `pb_hooks/lifecycle_status.js`.
  Behavior stays the same.
- **D2: A, with a confirmation.** The date stays, and project and page dates still
  count in stats. Book dates are not part of finished stats.
  When someone moves a record with a completion date from Completed to another
  status in the web app, ask whether they meant to change it. The prompt notes
  that the date is kept. Archived and Destashed are not prompted, because they
  are their own deliberate flow.
- **D3: A.** Keep the snap-back and show a hint under Status that explains it.
  A newly entered date snaps back without the D2 prompt.
- **D4: A.** Discriminated unions with a pure transition function. No new
  dependency.
- **D5:** The proposed order, sequentially: lifecycle, then the project image
  field and crop dialog, then bulk photo import. Item 4 stays deferred until
  someone is already working in that code.

The lifecycle policy above is unchanged.

## Consequences

- One documented rule for status and dates, with backend tests, and one
  helper on the server.
- Fewer impossible combinations, because the types won't allow them.
- Each refactor is behavior-preserving except where D2 or D3 changes the
  rule on purpose. Those changes need updates to `lifecycle-date-status.md`
  and possibly `stats-spec.md`.
- Native app parity: any change to D2 or D3 has to be checked against
  `Interactive-Buffoonery/organized-glitter-app`.
