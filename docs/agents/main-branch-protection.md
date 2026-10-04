# Branch protection

Verified on 2026-10-03: public extraction PR #1 is merged into `main`, which is
the default branch. Feature PRs target `dev`; release PRs merge `dev` into `main`.

The active `Publication security` ruleset requires both `Publication security`
and `CI result` from GitHub Actions on `main`, `dev`, and
`bootstrap/public-extraction`. Branches must be up to date before merging, checks
are enforced when branches are created, and there are no bypass actors.

`CI result` aggregates the workflow's required validation jobs, including browser
and backend checks. Keep the check name stable when changing job selection or
validation commands. A pending or failing aggregate check blocks merging even
when publication security passes.

These status-check rules do not require pull requests or approving reviews, resolve
review conversations, or block force pushes and branch deletion. Those protections
remain separate owner settings:

- Pull requests required for application changes.
- Review conversations resolved before merging.
- Force pushes and branch deletion blocked.
- An approving review when another reviewer is available.

Do not require deleted private checks or private review providers. All required
public validation is aggregated by `CI result`, including browser and backend
checks. Passing CI alone does not mean GitHub blocks unsafe pushes or merges.

Private-repository hosting-plan limitations do not establish the public
repository's capabilities. See [CI](ci.md) for the shipped checks.
