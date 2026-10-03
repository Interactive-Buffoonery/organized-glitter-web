# Local native app sync report

Before opening a web PR, use the report to decide whether the native app needs
companion work. It runs automatically before the required phases of
`pnpm test:pr` and `pnpm test:release`. Findings and report failures are advisory.
They do not change the web gate's exit status. Existing validation failures still
fail the gate.

This report runs locally. It is not a GitHub Actions job. A CI environment skips
it, including when the standalone command is called.

## Run it

```sh
# Feature PR targeting dev
pnpm native:sync --base=origin/dev

# Release PR targeting main
pnpm native:sync --base=origin/main

# Override a native checkout in another location
pnpm native:sync --base=origin/dev --native=/path/to/organized-glitter-app
```

Fetch the intended target branch before running. The command never fetches,
changes branches, modifies the native checkout, opens an app PR, or contacts a
model provider.

The default native checkout is `organized-glitter-app` beside the main web
checkout. This also works from a linked web worktree. Set `NATIVE_APP_REPO` to
select another checkout. `VALIDATION_BASE_REF` overrides the base for both the
report and local validation. PR validation defaults to `origin/dev`; release
validation defaults to `origin/main`.

Each run prints its Markdown report path. The standalone command writes
`report.md` and `report.json` beneath ignored `.tmp/native-sync/`. Full local
validation puts them in its run's `native-sync/` directory and records the
advisory result in `summary.json`. `--output=/path/to/local-report` selects a
standalone output directory.

## Read the result

| Result              | Next step                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| No app PR needed    | No shared change was identified by the source checks. Review the stated coverage before treating this as runtime evidence.                     |
| App PR recommended  | Review feature parity or additive schema changes. Open an app PR if the behavior belongs in native.                                            |
| App PR required     | A nonoptional decoded field or a used collection disappeared, or a decoded field changed type. Update the app or restore the backend contract. |
| Needs investigation | Check changed hooks, migrations, rules, constraints, configuration, unknown paths, or missing evidence before deciding.                        |

The report compares the target's merge base with the current web working tree.
It includes committed, staged, unstaged, deleted, renamed, and untracked paths.
Renames appear as removal and addition so a renamed backend file cannot escape
review. It records both commits, dirty status, the comparison revision, and source
hashes. Native source references come from the selected checkout's current Swift
files. This is one native checkout, not a matrix of supported app releases.

Schema checks inspect collection removal, field removal and type changes,
constraints, and authentication/authorization settings. Known native record
models map to collections in the report script. Update that mapping when adding
or renaming a record model. Swift source extraction is conservative source
inspection, not a full compiler analysis. It cannot establish endpoint behavior,
all write payloads, custom decoding, or feature parity.

Changed web feature files receive a parity review recommendation with relevant
native source locations. A web-only bug fix may need no app PR. Hook and migration
changes need investigation even when the schema is unchanged. Harmless schema
hash changes alone do not mean incompatibility.

For each finding, review the changed web behavior and referenced native callers.
Record which models, forms, screens, or sync operations need to change, along
with expected behavior and tests, before opening the companion app PR. A failed
integration run does not by itself prove the app needs a fix; the backend or test
setup may be at fault.

## Optional actual Swift client check

Run this for shared backend changes when you want runtime evidence:

```sh
pnpm native:sync --base=origin/dev --verify-native --simulator=<ios-26-iphone-udid>
```

To include it in the local pre-PR run:

```sh
NATIVE_SYNC_VERIFY=1 NATIVE_SYNC_SIMULATOR_ID=<ios-26-iphone-udid> pnpm test:pr
```

Choose an available iOS 26 iPhone simulator. This requires macOS, Xcode,
XcodeGen, the simulator runtime, and a native revision containing the seeded
PocketBase client test. Source reporting does not require these tools.

The check archives the committed native revision into the ignored report
directory, generates its Xcode project there, and starts a fresh loopback-only
PocketBase server using the candidate schema and hooks. It uses synthetic users
and the repository's checksum-verified PocketBase installer. The native checkout
and existing local or production servers are untouched. Tracked native edits or untracked Swift source
make integration unverified until committed or stashed; source inspection still
reports those edits.

The copied test includes an assertion that its seeded environment flag is enabled,
so a missing flag cannot silently turn it into a passing no-op. The original test
file stays unchanged. The selected Swift test covers authentication, record operations, multipart
uploads, and protected files. It does not cover mobile sync conflicts/retries,
offline reconciliation, native UI, provider configuration, or an existing-data
migration upgrade. The normal local backend phase separately runs mobile sync
and upgrade tests. Neither check establishes deployed-environment compatibility.

The report records whether integration passed, failed, or did not run and gives
the local `.xcresult` path when successful. Failure remains advisory and requires
investigation. The disposable server stops after the check. Reports, copied native
source, test result bundles, and synthetic backend runtime data stay ignored and
local. Do not attach the entire report directory to a public PR.
