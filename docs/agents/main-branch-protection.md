# Branch protection

The public extraction PR targets the empty `main` branch. The publication security ruleset requires
`Publication security` from GitHub Actions on `main`, `dev`, and
`bootstrap/public-extraction`. It has no bypass actors. GitHub secret scanning and
push protection are enabled. The security workflow must land through its PR before
branches without it can satisfy the required check.

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
