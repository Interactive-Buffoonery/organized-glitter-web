# Branch protection

Feature branches target `dev` through pull requests. Release pull requests merge
`dev` into `main`. This is repository policy; GitHub enforcement is not currently
available on this private repository's plan.

## Verified plan limitation

On September 6, 2026, live GitHub API requests for repository rulesets and classic
branch protection on both `dev` and `main` returned HTTP 403 with a plan-upgrade
message. No protection settings were changed during the CI refresh. Do not
interpret passing Actions checks as proof that direct pushes or unsafe merges
are blocked by GitHub.

The owning account or organization must enable a plan supporting protection for
this private repository before these rules can be enforced. Making the repository
public is a separate visibility decision, not part of the CI refresh.

## Intended rules

Both branches:

- Require a pull request.
- Require the exact `CI result` status check to pass.
- Require the branch to be up to date before merging.
- Require conversation resolution.
- Block force pushes and deletions.
- Require linear history.

For `main`, also require `Full Chromium and WebKit validation`, and accept release
PRs from `dev` only. Require one approving review when another reviewer is
available. If approvals are required, dismiss stale approvals after new commits.

OpenCode and Cursor Bugbot are advisory. A successful model invocation does not
mean a review has no findings or that its reviewed commit is still the current PR
head. See [`cursor-bugbot.md`](./cursor-bugbot.md) and
[`opencode-review.md`](./opencode-review.md) for their respective configurations.

## Activation order

1. Land the CI refresh through a PR and verify live workflow results.
2. Enable an appropriate GitHub plan if enforced protection is desired.
3. Configure the exact check names above, replacing old individual check names
   only after their replacement has been observed.
4. Verify the effective branch settings through GitHub's API and a representative
   pull request.

See [CI](./ci.md) for job definitions, local commands, schedules, and artifacts.
