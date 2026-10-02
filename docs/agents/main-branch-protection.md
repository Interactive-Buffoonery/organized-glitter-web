# Branch protection

The public extraction PR targets the empty `main` branch. Current GitHub state
was checked on 2026-10-02: `main` and `bootstrap/public-extraction` have no branch
protection or rulesets. This cleanup does not change repository settings.

Once the workflow is observed on the current public head, an owner can configure:

- Pull requests required for application changes.
- The exact `CI result` status check required and the branch kept up to date.
- Review conversations resolved before merging.
- Force pushes and branch deletion blocked.
- An approving review when another reviewer is available.

Do not require deleted private checks or private review providers. All required
public validation is aggregated by `CI result`, including browser and backend
checks. Passing CI alone does not mean GitHub blocks unsafe pushes or merges.

The owner must also choose the public branch/release policy after bootstrap.
Private-repository hosting-plan limitations do not establish the public
repository's capabilities. See [CI](ci.md) for the shipped checks.
